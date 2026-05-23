import { supabase } from '../../supabase/client';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FraudDetectionResult {
  passed: boolean;
  flags: string[];
  riskScore: number;
}

// ── Fuzzy match for company names ─────────────────────────────────────────────

function calculateStringDistance(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 0;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 0;

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

// ── checkFraudSignals ─────────────────────────────────────────────────────────
// Run fraud detection checks on organiser KYC data.

export async function checkFraudSignals(
  organiserId: string,
  pan: string,
  aadhaar: string,
  upi: string,
  bankAccount: string,
  contactMobiles: string[],
  companyName: string,
): Promise<FraudDetectionResult> {
  const flags: string[] = [];
  let riskScore = 0;

  try {
    // Check for duplicate documents using Supabase function
    const { data: duplicateCheck, error: dupError } = await supabase.rpc(
      'check_kyc_duplicates',
      {
        pan_number: pan,
        aadhaar_number: aadhaar,
        upi_id: upi,
        bank_account: bankAccount,
        current_organiser_id: organiserId,
      },
    );

    if (!dupError && duplicateCheck) {
      if (duplicateCheck.pan_exists) {
        flags.push('PAN number already registered');
        riskScore += 30;
      }
      if (duplicateCheck.aadhaar_exists) {
        flags.push('Aadhaar number already registered');
        riskScore += 30;
      }
      if (duplicateCheck.bank_account_exists) {
        flags.push('Bank account already registered');
        riskScore += 30;
      }
      if (duplicateCheck.upi_exists) {
        flags.push('UPI ID already registered');
        riskScore += 30;
      }
    }

    // Check if all contact mobiles are identical
    const uniqueMobiles = new Set(contactMobiles.filter((m) => m.trim()));
    if (uniqueMobiles.size === 1) {
      flags.push('All contact numbers are identical');
      riskScore += 20;
    }

    // Check for company name similarity
    const { data: existingOrganisers, error: orgError } = await supabase
      .from('users')
      .select('id, name')
      .eq('role', 'organiser')
      .neq('id', organiserId);

    if (!orgError && existingOrganisers) {
      existingOrganisers.forEach((org) => {
        const similarity = calculateStringDistance(companyName, org.name);
        if (similarity > 75) {
          flags.push(`Company name similar to existing organiser: "${org.name}"`);
          riskScore += 15;
        }
      });
    }

    return {
      passed: riskScore < 50,
      flags,
      riskScore,
    };
  } catch (error) {
    // Log error but don't fail the KYC process
    console.error('Fraud detection error:', error);
    return {
      passed: true,
      flags: ['Fraud detection check skipped due to error'],
      riskScore: 0,
    };
  }
}
