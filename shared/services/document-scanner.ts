import { supabase } from '../../supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocumentType = 
  | 'pan' 
  | 'aadhaar_front' 
  | 'aadhaar_back' 
  | 'cheque' 
  | 'address_proof_front' 
  | 'address_proof_back';

export interface DocumentScanResult {
  documentType: DocumentType;
  extractedData: Record<string, string>;
  crossCheckResults: Array<{
    field: string;
    expected: string;
    extracted: string;
    matched: boolean;
    similarity: number;
  }>;
  confidence: number;
  isValid: boolean;
  flags: string[];
}

// ── Fuzzy string matching ─────────────────────────────────────────────────────

function calculateSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 100;

  const editDistance = getEditDistance(longer, shorter);
  return Math.round(((longer.length - editDistance) / longer.length) * 100);
}

function getEditDistance(s1: string, s2: string): number {
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
}

// ── Get Claude prompt per document type ────────────────────────────────────────

function getPromptForDocumentType(documentType: DocumentType): string {
  switch (documentType) {
    case 'pan':
      return `Extract these fields from this PAN card image and return ONLY a JSON object with no markdown: { pan_number, name, father_name, date_of_birth, is_valid_pan_card: true/false, confidence: 0-100 }`;
    case 'aadhaar_front':
      return `Extract these fields from this Aadhaar card front side and return ONLY JSON: { aadhaar_number, name, date_of_birth, gender, is_valid_aadhaar: true/false, confidence: 0-100 }`;
    case 'aadhaar_back':
      return `Extract these fields from this Aadhaar card back side and return ONLY JSON: { address, pincode, state, is_valid_aadhaar_back: true/false, confidence: 0-100 }`;
    case 'cheque':
      return `Extract these fields from this cancelled cheque and return ONLY JSON: { account_number, ifsc_code, bank_name, account_holder_name, is_valid_cheque: true/false, confidence: 0-100 }`;
    case 'address_proof_front':
    case 'address_proof_back':
      return `Extract these fields from this address proof document and return ONLY JSON: { address, city, state, pincode, document_type, is_valid_address_proof: true/false, confidence: 0-100 }`;
    default:
      return '';
  }
}

// ── scanDocument ──────────────────────────────────────────────────────────────
// Scan document using Claude Vision API and cross-check extracted data.

export async function scanDocument(
  imageUrl: string,
  documentType: DocumentType,
  expectedValues: Record<string, string> = {},
): Promise<DocumentScanResult> {
  try {
    // Download image from Supabase storage and convert to base64
    const response = await fetch(imageUrl);
    const blob = await response.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    const mediaType = blob.type || 'image/jpeg';

    // Call Claude Vision API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY || '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mediaType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: getPromptForDocumentType(documentType),
              },
            ],
          },
        ],
      }),
    });

    if (!anthropicResponse.ok) {
      throw new Error(`Claude API error: ${anthropicResponse.statusText}`);
    }

    const claudeData = await anthropicResponse.json();
    const responseText = claudeData.content?.[0]?.text || '';

    // Parse JSON response
    let extractedData: Record<string, string> = {};
    let confidence = 0;
    let isValid = false;

    try {
      extractedData = JSON.parse(responseText);
      confidence = extractedData.confidence ? parseInt(extractedData.confidence as string) : 0;
      const validKey = `is_valid_${documentType.replace(/_front|_back/, '')}`;
      const validVal = extractedData[validKey] as unknown;
      isValid = validVal === true || validVal === 'true';
    } catch {
      throw new Error('Failed to parse Claude response as JSON');
    }

    // Cross-check extracted values against expected values
    const crossCheckResults = Object.entries(expectedValues).map(([field, expected]) => {
      const extracted = extractedData[field] || '';
      const similarity = calculateSimilarity(expected, extracted);
      const matched = similarity > 80;

      return {
        field,
        expected,
        extracted,
        matched,
        similarity,
      };
    });

    // Determine flags
    const flags: string[] = [];
    if (!isValid) flags.push(`Invalid ${documentType.replace(/_/g, ' ')}`);
    if (confidence < 70) flags.push(`Low confidence (${confidence}%)`);

    const failedChecks = crossCheckResults.filter((r) => !r.matched);
    if (failedChecks.length > 0) {
      flags.push(`Field mismatches: ${failedChecks.map((r) => r.field).join(', ')}`);
    }

    return {
      documentType,
      extractedData,
      crossCheckResults,
      confidence,
      isValid,
      flags,
    };
  } catch (error) {
    throw new Error(`Document scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

// ── calculateDocumentScore ────────────────────────────────────────────────────
// Calculate overall score from all document scan results.

export function calculateDocumentScore(results: DocumentScanResult[]): number {
  if (results.length === 0) return 0;

  // Start with average confidence
  const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
  let score = avgConfidence;

  // Deduct for failed cross-checks (15 points per field mismatch)
  results.forEach((result) => {
    const failedChecks = result.crossCheckResults.filter((r) => !r.matched).length;
    score -= failedChecks * 15;
  });

  // Deduct for invalid documents (20 points each)
  const invalidDocs = results.filter((r) => !r.isValid).length;
  score -= invalidDocs * 20;

  // Clamp between 0 and 100
  return Math.max(0, Math.min(100, Math.round(score)));
}
