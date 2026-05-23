import { supabase } from '../../supabase/client';
import {
  scanDocument,
  calculateDocumentScore,
  DocumentScanResult,
  DocumentType,
} from './document-scanner';
import { checkFraudSignals, FraudDetectionResult } from './fraud-detection';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface KYCResult {
  status: 'approved' | 'flagged' | 'rejected';
  finalScore: number;
  documentResults: DocumentScanResult[];
  fraudResult: FraudDetectionResult;
  flags: string[];
}

// ── runKYCVerification ────────────────────────────────────────────────────────
// Master function that orchestrates the complete KYC verification process.

export async function runKYCVerification(
  kycId: string,
  organiserId: string,
): Promise<KYCResult> {
  const allFlags: string[] = [];
  const documentResults: DocumentScanResult[] = [];

  try {
    // Step 1: Fetch organiser KYC record
    const { data: kycRecord, error: kycError } = await supabase
      .from('organiser_kyc')
      .select('*')
      .eq('id', kycId)
      .eq('organiser_id', organiserId)
      .single();

    if (kycError || !kycRecord) {
      throw new Error('KYC record not found');
    }

    // Fetch organiser name for fraud detection
    const { data: organiserData } = await supabase
      .from('users')
      .select('name')
      .eq('id', organiserId)
      .single();

    const companyName = kycRecord.company_name || organiserData?.name || '';

    // Step 2: Run fraud detection
    const fraudResult = await checkFraudSignals(
      organiserId,
      kycRecord.pan_number,
      kycRecord.aadhaar_number,
      kycRecord.upi_id,
      kycRecord.bank_account,
      [
        kycRecord.contact_person_1_mobile,
        kycRecord.contact_person_2_mobile,
        kycRecord.contact_person_3_mobile,
      ],
      companyName,
    );

    allFlags.push(...fraudResult.flags);

    // Step 3: Get signed URLs for all document uploads
    const documentPaths = [
      { type: 'pan' as DocumentType, path: `${organiserId}/pan_scan.jpg` },
      { type: 'aadhaar_front' as DocumentType, path: `${organiserId}/aadhaar_front.jpg` },
      { type: 'aadhaar_back' as DocumentType, path: `${organiserId}/aadhaar_back.jpg` },
      { type: 'cheque' as DocumentType, path: `${organiserId}/cheque.jpg` },
      { type: 'address_proof_front' as DocumentType, path: `${organiserId}/address_proof_front.jpg` },
      { type: 'address_proof_back' as DocumentType, path: `${organiserId}/address_proof_back.jpg` },
    ];

    const signedUrls: Record<string, string> = {};
    for (const doc of documentPaths) {
      const { data } = await supabase.storage
        .from('kyc-documents')
        .createSignedUrl(doc.path, 3600);

      if (data?.signedUrl) {
        signedUrls[doc.type] = data.signedUrl;
      }
    }

    // Step 4: Run Claude Vision on each document
    const expectedValues: Record<string, any> = {
      pan: {
        pan_number: kycRecord.pan_number,
        name: kycRecord.contact_person_1_name,
      },
      aadhaar_front: {
        aadhaar_number: kycRecord.aadhaar_number,
        name: kycRecord.contact_person_1_name,
      },
      aadhaar_back: {
        state: kycRecord.office_state,
        pincode: kycRecord.office_pincode,
      },
      cheque: {
        account_number: kycRecord.bank_account,
        account_holder_name: kycRecord.account_holder_name,
      },
      address_proof_front: {
        address: kycRecord.office_address_line_1,
        city: kycRecord.office_city,
        state: kycRecord.office_state,
        pincode: kycRecord.office_pincode,
      },
    };

    for (const doc of documentPaths) {
      if (signedUrls[doc.type]) {
        const result = await scanDocument(
          signedUrls[doc.type],
          doc.type,
          expectedValues[doc.type] || {},
        );
        documentResults.push(result);
        allFlags.push(...result.flags);
      }
    }

    // Step 5: Calculate overall score
    const documentScore = calculateDocumentScore(documentResults);
    const fraudPenalty = fraudResult.riskScore;
    const finalScore = Math.max(0, Math.min(100, documentScore - fraudPenalty));

    // Step 6: Determine status
    let status: 'approved' | 'flagged' | 'rejected';
    if (finalScore >= 85) {
      status = 'approved';
    } else if (finalScore >= 60) {
      status = 'flagged';
    } else {
      status = 'rejected';
    }

    // Step 7: Update organiser_kyc table
    const { error: updateError } = await supabase
      .from('organiser_kyc')
      .update({
        ai_verification_score: finalScore,
        ai_document_results: documentResults,
        ai_fraud_flags: allFlags,
        ai_fraud_risk_score: fraudResult.riskScore,
        verification_status: status,
      })
      .eq('id', kycId);

    if (updateError) {
      throw new Error(`Failed to update KYC record: ${updateError.message}`);
    }

    // Step 8: Insert log rows
    for (const result of documentResults) {
      await supabase.from('kyc_verification_log').insert({
        kyc_id: kycId,
        organiser_id: organiserId,
        check_type: 'document_scan',
        document_type: result.documentType,
        result: result.isValid ? 'passed' : 'failed',
        details: JSON.stringify(result),
      });
    }

    await supabase.from('kyc_verification_log').insert({
      kyc_id: kycId,
      organiser_id: organiserId,
      check_type: 'fraud_detection',
      result: fraudResult.passed ? 'passed' : 'flagged',
      details: JSON.stringify(fraudResult),
    });

    // Step 9-11: Send notifications based on status
    if (status === 'approved') {
      // Approved — send celebration notification
      await supabase
        .from('organiser_notifications')
        .insert({
          organiser_id: organiserId,
          type: 'kyc_approved',
          title: '✅ You\'re verified!',
          message: 'Your KYC has been approved. You can now create events.',
          is_read: false,
        });
    } else if (status === 'flagged') {
      // Flagged — send admin notification
      await supabase
        .from('admin_notifications')
        .insert({
          type: 'kyc_flagged',
          organiser_id: organiserId,
          message: `KYC review needed for ${companyName}`,
          score: finalScore,
          is_read: false,
        });
    } else {
      // Rejected — send rejection notification
      await supabase
        .from('organiser_notifications')
        .insert({
          organiser_id: organiserId,
          type: 'kyc_rejected',
          title: '❌ KYC Verification Failed',
          message: `Your KYC could not be verified. Reasons: ${allFlags.join(', ')}. Please resubmit with correct documents.`,
          is_read: false,
        });
    }

    return {
      status,
      finalScore,
      documentResults,
      fraudResult,
      flags: allFlags,
    };
  } catch (error) {
    throw new Error(`KYC verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ── Utility: Get KYC verification result for display ───────────────────────────

export async function getKYCResult(
  kycId: string,
  organiserId: string,
): Promise<KYCResult | null> {
  const { data: kycRecord } = await supabase
    .from('organiser_kyc')
    .select('*')
    .eq('id', kycId)
    .eq('organiser_id', organiserId)
    .single();

  if (!kycRecord || !kycRecord.verification_status) {
    return null;
  }

  return {
    status: kycRecord.verification_status,
    finalScore: kycRecord.ai_verification_score || 0,
    documentResults: kycRecord.ai_document_results || [],
    fraudResult: {
      passed: kycRecord.verification_status !== 'rejected',
      flags: kycRecord.ai_fraud_flags || [],
      riskScore: kycRecord.ai_fraud_risk_score || 0,
    },
    flags: kycRecord.ai_fraud_flags || [],
  };
}
