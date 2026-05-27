import React, { useEffect, useState } from 'react';
import {
  View,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../supabase/client';
import { runKYCVerification } from '../../shared/services/kyc-orchestrator';

const DRAFT_KEY = '@guestful_kyc_draft';
const GOLD = '#D4A853';
const BG = '#0C0904';
const WW = '#F0E8D5';
const MUTED = 'rgba(240,232,213,0.50)';

interface KYCDraft {
  // Step 0: Organiser type
  organiser_type: 'event_organiser' | 'travel_agent' | '';
  agency_name: string;
  iata_code: string;
  trip_type: 'domestic' | 'international' | 'both' | '';
  avg_group_size: string;

  // Step 1: Company
  company_name: string;
  company_type: string;
  gst_number: string;
  office_address_line_1: string;
  office_address_line_2: string;
  office_city: string;
  office_state: string;
  office_pincode: string;
  address_proof_front_uri?: string;
  address_proof_back_uri?: string;

  // Step 2: Identity
  pan_number: string;
  pan_scan_uri?: string;
  aadhaar_number: string;
  aadhaar_front_uri?: string;
  aadhaar_back_uri?: string;

  // Step 3: Banking
  account_holder_name: string;
  bank_name: string;
  account_number: string;
  account_number_confirm: string;
  ifsc_code: string;
  account_type: string;
  cheque_uri?: string;
  upi_id: string;

  // Step 4: Contacts
  contact_person_1_name: string;
  contact_person_1_gender: string;
  contact_person_1_mobile: string;
  contact_person_1_email: string;

  contact_person_2_name: string;
  contact_person_2_gender: string;
  contact_person_2_mobile: string;
  contact_person_2_email: string;

  contact_person_3_name: string;
  contact_person_3_gender: string;
  contact_person_3_mobile: string;
  contact_person_3_email: string;

  // Step 5: Review
  digital_signature: string;
  terms_accepted: boolean;
}

const EMPTY_DRAFT: KYCDraft = {
  organiser_type: '',
  agency_name: '',
  iata_code: '',
  trip_type: '',
  avg_group_size: '',

  company_name: '',
  company_type: '',
  gst_number: '',
  office_address_line_1: '',
  office_address_line_2: '',
  office_city: '',
  office_state: '',
  office_pincode: '',

  pan_number: '',
  aadhaar_number: '',

  account_holder_name: '',
  bank_name: '',
  account_number: '',
  account_number_confirm: '',
  ifsc_code: '',
  account_type: '',
  upi_id: '',

  contact_person_1_name: '',
  contact_person_1_gender: '',
  contact_person_1_mobile: '',
  contact_person_1_email: '',

  contact_person_2_name: '',
  contact_person_2_gender: '',
  contact_person_2_mobile: '',
  contact_person_2_email: '',

  contact_person_3_name: '',
  contact_person_3_gender: '',
  contact_person_3_mobile: '',
  contact_person_3_email: '',

  digital_signature: '',
  terms_accepted: false,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: BG,
  },
  content: {
    padding: 24,
  },
  progressBar: {
    flexDirection: 'row',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 8,
    backgroundColor: '#1A1A1A',
  },
  step: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#333',
  },
  stepDotActive: {
    backgroundColor: GOLD,
  },
  stepLabel: {
    fontSize: 10,
    color: '#808080',
  },
  heading: {
    fontSize: 24,
    fontWeight: '700',
    color: WW,
    marginBottom: 8,
  },
  subheading: {
    fontSize: 14,
    color: MUTED,
    marginBottom: 24,
  },
  formGroup: {
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    color: GOLD,
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: WW,
    fontSize: 13,
  },
  row: {
    flexDirection: 'row',
    gap: 16,
  },
  rowItem: {
    flex: 1,
  },
  select: {
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    borderRadius: 4,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: WW,
    fontSize: 13,
  },
  uploadButton: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: GOLD,
    borderRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadButtonText: {
    color: GOLD,
    fontSize: 13,
    fontWeight: '600',
  },
  uploadedLabel: {
    fontSize: 12,
    color: '#50C878',
    marginTop: 4,
  },
  buttonGroup: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 32,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonSecondary: {
    backgroundColor: '#333',
  },
  buttonPrimary: {
    backgroundColor: GOLD,
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
  },
  buttonTextPrimary: {
    color: BG,
  },
  buttonTextSecondary: {
    color: WW,
  },
  error: {
    color: '#FF5252',
    fontSize: 12,
    marginTop: 4,
  },
  disclaimerBox: {
    backgroundColor: '#1A1A1A',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 4,
    padding: 16,
    marginBottom: 24,
  },
  disclaimerText: {
    color: WW,
    fontSize: 12,
    lineHeight: 18,
    marginBottom: 16,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  checkboxBox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: GOLD,
    borderRadius: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: GOLD,
  },
  checkboxLabel: {
    flex: 1,
    color: WW,
    fontSize: 13,
  },
  typeCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.12)',
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  typeCardActive: {
    borderColor: GOLD,
    backgroundColor: 'rgba(212,168,83,0.08)',
  },
  typeCardIcon:  { fontSize: 28, marginTop: 2 },
  typeCardTitle: { fontSize: 16, fontWeight: '700', color: WW, marginBottom: 6 },
  typeCardDesc:  { fontSize: 12, color: MUTED, lineHeight: 18, marginBottom: 8 },
  typeCardBadge: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(212,168,83,0.15)',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  typeCardBadgeText: { fontSize: 11, color: GOLD, fontWeight: '600' },
  typeCardCheck: {
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: GOLD,
    justifyContent: 'center', alignItems: 'center',
    marginTop: 2,
  },

  resultScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  resultEmoji: {
    fontSize: 80,
    marginBottom: 24,
  },
  resultTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: WW,
    marginBottom: 12,
    textAlign: 'center',
  },
  resultMessage: {
    fontSize: 14,
    color: MUTED,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default function OrganiserSignup() {
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [disclaimer, setDisclaimer] = useState('');

  useEffect(() => {
    loadDraft();
    loadDisclaimer();
  }, []);

  const loadDraft = async () => {
    const saved = await AsyncStorage.getItem(DRAFT_KEY);
    if (saved) {
      setDraft(JSON.parse(saved));
    }
  };

  const loadDisclaimer = async () => {
    const { data } = await supabase
      .from('admin_settings')
      .select('value')
      .eq('key', 'organiser_disclaimer')
      .single();

    if (data) {
      setDisclaimer(data.value);
    }
  };

  const saveDraft = async (updated: KYCDraft) => {
    setDraft(updated);
    await AsyncStorage.setItem(DRAFT_KEY, JSON.stringify(updated));
  };

  const pickDocument = async (field: string) => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['image/*'],
      });

      if (!result.canceled && result.assets?.[0]) {
        const updated = { ...draft, [field]: result.assets[0].uri };
        await saveDraft(updated);
      }
    } catch (err) {
      Alert.alert('Error', 'Failed to pick document');
    }
  };

  const validateStep = (): boolean => {
    switch (step) {
      case 0:
        return draft.organiser_type === 'event_organiser' || draft.organiser_type === 'travel_agent';
      case 1:
        return (
          draft.company_name.length > 0 &&
          draft.company_type.length > 0 &&
          draft.office_address_line_1.length > 0 &&
          draft.office_city.length > 0 &&
          draft.office_state.length > 0 &&
          draft.office_pincode.length > 0 &&
          (draft.address_proof_front_uri?.length ?? 0) > 0 &&
          (draft.address_proof_back_uri?.length ?? 0) > 0
        );
      case 2:
        return (
          draft.pan_number.length === 10 &&
          (draft.pan_scan_uri?.length ?? 0) > 0 &&
          draft.aadhaar_number.length === 12 &&
          (draft.aadhaar_front_uri?.length ?? 0) > 0 &&
          (draft.aadhaar_back_uri?.length ?? 0) > 0
        );
      case 3:
        return (
          draft.account_holder_name.length > 0 &&
          draft.bank_name.length > 0 &&
          draft.account_number.length > 0 &&
          draft.account_number === draft.account_number_confirm &&
          draft.ifsc_code.length > 0 &&
          draft.account_type.length > 0 &&
          (draft.cheque_uri?.length ?? 0) > 0 &&
          draft.upi_id.length > 0
        );
      case 4:
        return (
          draft.contact_person_1_name.length > 0 &&
          draft.contact_person_1_mobile.length === 10 &&
          draft.contact_person_2_name.length > 0 &&
          draft.contact_person_2_mobile.length === 10 &&
          draft.contact_person_3_name.length > 0 &&
          draft.contact_person_3_mobile.length === 10
        );
      case 5:
        return (
          draft.digital_signature === draft.contact_person_1_name &&
          draft.terms_accepted
        );
      default:
        return false;
    }
  };

  const handleSubmit = async () => {
    if (!validateStep()) {
      Alert.alert('Validation Error', 'Please fill in all required fields');
      return;
    }

    setLoading(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Update users table with organiser_type for routing/display
      await supabase
        .from('users')
        .update({ organiser_type: draft.organiser_type })
        .eq('id', user.id);

      // Create KYC record
      const { data: kycData, error: kycError } = await supabase
        .from('organiser_kyc')
        .insert({
          organiser_id:   user.id,
          organiser_type: draft.organiser_type,
          agency_name:    draft.organiser_type === 'travel_agent' ? draft.agency_name : null,
          iata_code:      draft.organiser_type === 'travel_agent' ? draft.iata_code   : null,
          trip_type:      draft.organiser_type === 'travel_agent' ? draft.trip_type   : null,
          avg_group_size: draft.organiser_type === 'travel_agent' && draft.avg_group_size
                            ? parseInt(draft.avg_group_size, 10) : null,
          company_name:            draft.company_name,
          company_type:            draft.company_type,
          gst_number:              draft.gst_number,
          office_address_line_1:   draft.office_address_line_1,
          office_address_line_2:   draft.office_address_line_2,
          office_city:             draft.office_city,
          office_state:            draft.office_state,
          office_pincode:          draft.office_pincode,
          pan_number:              draft.pan_number,
          aadhaar_number:          draft.aadhaar_number,
          account_holder_name:     draft.account_holder_name,
          bank_name:               draft.bank_name,
          account_number:          draft.account_number,
          ifsc_code:               draft.ifsc_code,
          account_type:            draft.account_type,
          upi_id:                  draft.upi_id,
          contact_person_1_name:   draft.contact_person_1_name,
          contact_person_1_gender: draft.contact_person_1_gender,
          contact_person_1_mobile: draft.contact_person_1_mobile,
          contact_person_1_email:  draft.contact_person_1_email,
          contact_person_2_name:   draft.contact_person_2_name,
          contact_person_2_gender: draft.contact_person_2_gender,
          contact_person_2_mobile: draft.contact_person_2_mobile,
          contact_person_2_email:  draft.contact_person_2_email,
          contact_person_3_name:   draft.contact_person_3_name,
          contact_person_3_gender: draft.contact_person_3_gender,
          contact_person_3_mobile: draft.contact_person_3_mobile,
          contact_person_3_email:  draft.contact_person_3_email,
          digital_signature:       draft.digital_signature,
          terms_accepted:          draft.terms_accepted,
          verification_status:     'pending',
        })
        .select()
        .single();

      if (kycError || !kycData) throw new Error('Failed to create KYC record');

      // Upload documents to Supabase storage
      const uploads = [
        { uri: draft.pan_scan_uri, path: `${user.id}/pan_scan.jpg` },
        { uri: draft.aadhaar_front_uri, path: `${user.id}/aadhaar_front.jpg` },
        { uri: draft.aadhaar_back_uri, path: `${user.id}/aadhaar_back.jpg` },
        { uri: draft.cheque_uri, path: `${user.id}/cheque.jpg` },
        { uri: draft.address_proof_front_uri, path: `${user.id}/address_proof_front.jpg` },
        { uri: draft.address_proof_back_uri, path: `${user.id}/address_proof_back.jpg` },
      ];

      for (const upload of uploads) {
        if (upload.uri) {
          const response = await fetch(upload.uri);
          const blob = await response.blob();
          await supabase.storage.from('kyc-documents').upload(upload.path, blob);
        }
      }

      // Run KYC verification
      const verificationResult = await runKYCVerification(kycData.id, user.id);

      setResult(verificationResult);
      await AsyncStorage.removeItem(DRAFT_KEY);
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Submission failed');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    return (
      <View style={styles.container}>
        <View style={styles.resultScreen}>
          <Text style={styles.resultEmoji}>
            {result.status === 'approved' ? '✅' : result.status === 'flagged' ? '⏳' : '❌'}
          </Text>
          <Text style={styles.resultTitle}>
            {result.status === 'approved'
              ? "You're verified!"
              : result.status === 'flagged'
              ? 'Your KYC is under review.'
              : 'KYC could not be verified.'}
          </Text>
          <Text style={styles.resultMessage}>
            {result.status === 'approved'
              ? 'Start creating your first event.'
              : result.status === 'flagged'
              ? 'Our team will verify within 24 hours.'
              : `Reason: ${result.flags.join(', ')}`}
          </Text>
          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary]}
            onPress={() =>
              result.status === 'approved'
                ? router.push('/create-event/event-type')
                : router.push('/auth/select-role')
            }
          >
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
              {result.status === 'approved' ? 'Create Event →' : 'Back to Dashboard'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={[styles.container, styles.loadingContainer]}>
        <ActivityIndicator size="large" color={GOLD} />
        <Text style={[styles.heading, { marginTop: 16 }]}>Verifying documents...</Text>
        <Text style={styles.subheading}>This takes about 30 seconds</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Progress bar */}
      <View style={styles.progressBar}>
        {[0, 1, 2, 3, 4, 5].map((s) => (
          <View key={s} style={styles.step}>
            <View style={[styles.stepDot, s <= step && styles.stepDotActive]} />
            <Text style={styles.stepLabel}>{['TY', 'Co', 'ID', 'BA', 'CT', 'RV'][s]}</Text>
          </View>
        ))}
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Step 0: Who are you? */}
        {step === 0 && (
          <>
            <Text style={styles.heading}>How will you use Guestful Clicks?</Text>
            <Text style={styles.subheading}>
              Choose your organiser type. This determines your pricing and features.
            </Text>

            {(
              [
                {
                  type: 'event_organiser' as const,
                  icon: '🎪',
                  title: 'Event Organiser',
                  desc: 'I run public events — concerts, sports, music festivals, corporate gatherings. I create the event and guests pay to participate. I earn 25% of all collections.',
                  badge: 'Earn 25% revenue share',
                },
                {
                  type: 'travel_agent' as const,
                  icon: '✈️',
                  title: 'Travel Agent',
                  desc: 'I manage group trips and holiday programmes. I pay per traveller upfront and my clients shoot and share freely — no payment friction during the trip.',
                  badge: 'Pay per traveller, keep your margin',
                },
              ] as const
            ).map((opt) => {
              const active = draft.organiser_type === opt.type;
              return (
                <TouchableOpacity
                  key={opt.type}
                  style={[styles.typeCard, active && styles.typeCardActive]}
                  onPress={() => saveDraft({ ...draft, organiser_type: opt.type })}
                  activeOpacity={0.8}
                >
                  <Text style={styles.typeCardIcon}>{opt.icon}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.typeCardTitle, active && { color: GOLD }]}>{opt.title}</Text>
                    <Text style={styles.typeCardDesc}>{opt.desc}</Text>
                    <View style={styles.typeCardBadge}>
                      <Text style={styles.typeCardBadgeText}>{opt.badge}</Text>
                    </View>
                  </View>
                  {active && (
                    <View style={styles.typeCardCheck}>
                      <Text style={{ color: BG, fontSize: 12, fontWeight: '700' }}>✓</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </>
        )}

        {/* Step 1: Company */}
        {step === 1 && (
          <>
            <Text style={styles.heading}>Company Details</Text>
            <Text style={styles.subheading}>Tell us about your company</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Name *</Text>
              <TextInput
                style={styles.input}
                value={draft.company_name}
                onChangeText={(text) => saveDraft({ ...draft, company_name: text })}
                placeholder="Your company name"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Company Type *</Text>
              <TextInput
                style={styles.select}
                value={draft.company_type}
                onChangeText={(text) => saveDraft({ ...draft, company_type: text })}
                placeholder="e.g. Wedding, Photography, Events"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>GST Number</Text>
              <TextInput
                style={styles.input}
                value={draft.gst_number}
                onChangeText={(text) => saveDraft({ ...draft, gst_number: text })}
                placeholder="Optional"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Office Address Line 1 *</Text>
              <TextInput
                style={styles.input}
                value={draft.office_address_line_1}
                onChangeText={(text) => saveDraft({ ...draft, office_address_line_1: text })}
                placeholder="Street address"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Office Address Line 2</Text>
              <TextInput
                style={styles.input}
                value={draft.office_address_line_2}
                onChangeText={(text) => saveDraft({ ...draft, office_address_line_2: text })}
                placeholder="Apartment, suite, etc."
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.row}>
              <View style={styles.rowItem}>
                <Text style={styles.label}>City *</Text>
                <TextInput
                  style={styles.input}
                  value={draft.office_city}
                  onChangeText={(text) => saveDraft({ ...draft, office_city: text })}
                  placeholder="City"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                />
              </View>
              <View style={styles.rowItem}>
                <Text style={styles.label}>State *</Text>
                <TextInput
                  style={styles.input}
                  value={draft.office_state}
                  onChangeText={(text) => saveDraft({ ...draft, office_state: text })}
                  placeholder="State"
                  placeholderTextColor="rgba(255,255,255,0.4)"
                />
              </View>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Pincode *</Text>
              <TextInput
                style={styles.input}
                value={draft.office_pincode}
                onChangeText={(text) => saveDraft({ ...draft, office_pincode: text })}
                placeholder="6 digits"
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={6}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Address Proof Front *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => pickDocument('address_proof_front_uri')}
              >
                <Text style={styles.uploadButtonText}>
                  {draft.address_proof_front_uri ? '✓ Uploaded' : '+ Upload Document'}
                </Text>
              </TouchableOpacity>
              {draft.address_proof_front_uri && <Text style={styles.uploadedLabel}>Document uploaded</Text>}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Address Proof Back *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => pickDocument('address_proof_back_uri')}
              >
                <Text style={styles.uploadButtonText}>
                  {draft.address_proof_back_uri ? '✓ Uploaded' : '+ Upload Document'}
                </Text>
              </TouchableOpacity>
              {draft.address_proof_back_uri && <Text style={styles.uploadedLabel}>Document uploaded</Text>}
            </View>

            {/* Travel agent extra fields */}
            {draft.organiser_type === 'travel_agent' && (
              <>
                <Text style={[styles.label, { marginTop: 16, marginBottom: 4 }]}>
                  TRAVEL AGENCY DETAILS
                </Text>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Travel Agency Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.agency_name}
                    onChangeText={(text) => saveDraft({ ...draft, agency_name: text })}
                    placeholder="Your agency name"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>IATA Code</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.iata_code}
                    onChangeText={(text) => saveDraft({ ...draft, iata_code: text.toUpperCase() })}
                    placeholder="Optional — if IATA registered"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    autoCapitalize="characters"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Type of Trips</Text>
                  <View style={styles.row}>
                    {(['domestic', 'international', 'both'] as const).map((t) => (
                      <TouchableOpacity
                        key={t}
                        style={[
                          styles.button,
                          draft.trip_type === t ? styles.buttonPrimary : styles.buttonSecondary,
                          { flex: 1 },
                        ]}
                        onPress={() => saveDraft({ ...draft, trip_type: t })}
                      >
                        <Text
                          style={[
                            styles.buttonText,
                            draft.trip_type === t ? styles.buttonTextPrimary : styles.buttonTextSecondary,
                          ]}
                        >
                          {t.charAt(0).toUpperCase() + t.slice(1)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Average Group Size</Text>
                  <TextInput
                    style={styles.input}
                    value={draft.avg_group_size}
                    onChangeText={(text) => saveDraft({ ...draft, avg_group_size: text })}
                    placeholder="How many travellers per trip?"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="numeric"
                  />
                </View>
              </>
            )}
          </>
        )}

        {/* Step 2: Identity */}
        {step === 2 && (
          <>
            <Text style={styles.heading}>Identity Documents</Text>
            <Text style={styles.subheading}>Upload your government IDs</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>PAN Number *</Text>
              <TextInput
                style={styles.input}
                value={draft.pan_number}
                onChangeText={(text) => saveDraft({ ...draft, pan_number: text.toUpperCase() })}
                placeholder="AAAAA9999A"
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={10}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>PAN Card Scan *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => pickDocument('pan_scan_uri')}
              >
                <Text style={styles.uploadButtonText}>
                  {draft.pan_scan_uri ? '✓ Uploaded' : '+ Upload PAN Card'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Aadhaar Number *</Text>
              <TextInput
                style={styles.input}
                value={draft.aadhaar_number}
                onChangeText={(text) => saveDraft({ ...draft, aadhaar_number: text })}
                placeholder="12 digits"
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={12}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Aadhaar Front *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => pickDocument('aadhaar_front_uri')}
              >
                <Text style={styles.uploadButtonText}>
                  {draft.aadhaar_front_uri ? '✓ Uploaded' : '+ Upload Front Side'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Aadhaar Back *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => pickDocument('aadhaar_back_uri')}
              >
                <Text style={styles.uploadButtonText}>
                  {draft.aadhaar_back_uri ? '✓ Uploaded' : '+ Upload Back Side'}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* Step 3: Banking */}
        {step === 3 && (
          <>
            <Text style={styles.heading}>Banking Details</Text>
            <Text style={styles.subheading}>Where we'll send your payments</Text>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Account Holder Name *</Text>
              <TextInput
                style={styles.input}
                value={draft.account_holder_name}
                onChangeText={(text) => saveDraft({ ...draft, account_holder_name: text })}
                placeholder="Name on bank account"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Bank Name *</Text>
              <TextInput
                style={styles.input}
                value={draft.bank_name}
                onChangeText={(text) => saveDraft({ ...draft, bank_name: text })}
                placeholder="e.g. HDFC Bank"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Account Number *</Text>
              <TextInput
                style={styles.input}
                value={draft.account_number}
                onChangeText={(text) => saveDraft({ ...draft, account_number: text })}
                placeholder="16 digits"
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={16}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Confirm Account Number *</Text>
              <TextInput
                style={[
                  styles.input,
                  draft.account_number !== draft.account_number_confirm &&
                  draft.account_number_confirm.length > 0 && { borderColor: '#FF5252' },
                ]}
                value={draft.account_number_confirm}
                onChangeText={(text) => saveDraft({ ...draft, account_number_confirm: text })}
                placeholder="Must match above"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
              {draft.account_number !== draft.account_number_confirm && draft.account_number_confirm.length > 0 && (
                <Text style={styles.error}>Account numbers don't match</Text>
              )}
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>IFSC Code *</Text>
              <TextInput
                style={styles.input}
                value={draft.ifsc_code}
                onChangeText={(text) => saveDraft({ ...draft, ifsc_code: text.toUpperCase() })}
                placeholder="11 characters"
                placeholderTextColor="rgba(255,255,255,0.4)"
                maxLength={11}
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Account Type *</Text>
              <TextInput
                style={styles.select}
                value={draft.account_type}
                onChangeText={(text) => saveDraft({ ...draft, account_type: text })}
                placeholder="Savings or Current"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>Cancelled Cheque *</Text>
              <TouchableOpacity
                style={styles.uploadButton}
                onPress={() => pickDocument('cheque_uri')}
              >
                <Text style={styles.uploadButtonText}>
                  {draft.cheque_uri ? '✓ Uploaded' : '+ Upload Cheque'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formGroup}>
              <Text style={styles.label}>UPI ID *</Text>
              <TextInput
                style={styles.input}
                value={draft.upi_id}
                onChangeText={(text) => saveDraft({ ...draft, upi_id: text })}
                placeholder="yourname@upi"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
            </View>
          </>
        )}

        {/* Step 4: Contacts */}
        {step === 4 && (
          <>
            <Text style={styles.heading}>Contact Persons</Text>
            <Text style={styles.subheading}>Add at least 3 contact people</Text>

            {[1, 2, 3].map((i) => (
              <View key={i}>
                <Text style={[styles.heading, { fontSize: 16, marginTop: 16 }]}>Contact {i}</Text>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Full Name *</Text>
                  <TextInput
                    style={styles.input}
                    value={(draft as any)[`contact_person_${i}_name`]}
                    onChangeText={(text) =>
                      saveDraft({ ...draft, [`contact_person_${i}_name`]: text } as any)
                    }
                    placeholder="Full name"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Gender *</Text>
                  <TextInput
                    style={styles.select}
                    value={(draft as any)[`contact_person_${i}_gender`]}
                    onChangeText={(text) =>
                      saveDraft({ ...draft, [`contact_person_${i}_gender`]: text } as any)
                    }
                    placeholder="Male / Female / Other"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Mobile Number *</Text>
                  <TextInput
                    style={styles.input}
                    value={(draft as any)[`contact_person_${i}_mobile`]}
                    onChangeText={(text) =>
                      saveDraft({ ...draft, [`contact_person_${i}_mobile`]: text } as any)
                    }
                    placeholder="10 digits"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    maxLength={10}
                    keyboardType="numeric"
                  />
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Email *</Text>
                  <TextInput
                    style={styles.input}
                    value={(draft as any)[`contact_person_${i}_email`]}
                    onChangeText={(text) =>
                      saveDraft({ ...draft, [`contact_person_${i}_email`]: text } as any)
                    }
                    placeholder="email@example.com"
                    placeholderTextColor="rgba(255,255,255,0.4)"
                    keyboardType="email-address"
                  />
                </View>
              </View>
            ))}
          </>
        )}

        {/* Step 5: Review */}
        {step === 5 && (
          <>
            <Text style={styles.heading}>Review & Submit</Text>
            <Text style={styles.subheading}>Confirm all details before submitting</Text>

            {/* Account type banner */}
            <View style={[styles.typeCard, styles.typeCardActive, { marginBottom: 20 }]}>
              <Text style={styles.typeCardIcon}>
                {draft.organiser_type === 'travel_agent' ? '✈️' : '🎪'}
              </Text>
              <View style={{ flex: 1 }}>
                <Text style={[styles.typeCardTitle, { color: GOLD }]}>Account Type</Text>
                <Text style={styles.typeCardDesc}>
                  {draft.organiser_type === 'travel_agent' ? 'Travel Agent' : 'Event Organiser'}
                </Text>
                <View style={styles.typeCardBadge}>
                  <Text style={styles.typeCardBadgeText}>
                    {draft.organiser_type === 'travel_agent'
                      ? 'Pay per traveller, keep your margin'
                      : 'Earn 25% revenue share'}
                  </Text>
                </View>
              </View>
            </View>

            <View style={styles.disclaimerBox}>
              <Text style={styles.disclaimerText}>
                {disclaimer || 'By submitting your KYC, you certify that all information is true and accurate.'}
              </Text>

              <Text style={styles.disclaimerText}>
                Payout Policy: Your earnings are processed monthly after applicable statutory deductions as required by your country's financial and tax laws. A detailed payout statement showing gross earnings, deductions, and net amount will be shared with you before every transfer. By proceeding you agree to this payout process.
              </Text>

              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => saveDraft({ ...draft, terms_accepted: !draft.terms_accepted })}
              >
                <View
                  style={[
                    styles.checkboxBox,
                    draft.terms_accepted && styles.checkboxChecked,
                  ]}
                >
                  {draft.terms_accepted && <Text style={{ color: BG, fontSize: 14 }}>✓</Text>}
                </View>
                <Text style={styles.checkboxLabel}>I agree to the above terms and conditions</Text>
              </TouchableOpacity>

              <Text style={styles.label}>Digital Signature *</Text>
              <Text style={[styles.subheading, { marginBottom: 8 }]}>
                Type {draft.contact_person_1_name || 'your name'} to sign
              </Text>
              <TextInput
                style={styles.input}
                value={draft.digital_signature}
                onChangeText={(text) => saveDraft({ ...draft, digital_signature: text })}
                placeholder="Type your full name"
                placeholderTextColor="rgba(255,255,255,0.4)"
              />
              {draft.digital_signature !== draft.contact_person_1_name && draft.digital_signature.length > 0 && (
                <Text style={styles.error}>Signature must match contact person 1 name</Text>
              )}
            </View>
          </>
        )}

        <View style={styles.buttonGroup}>
          {step > 0 && (
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => setStep(step - 1)}
            >
              <Text style={[styles.buttonText, styles.buttonTextSecondary]}>← Back</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.button, styles.buttonPrimary, !validateStep() && { opacity: 0.5 }]}
            onPress={
              step === 5
                ? handleSubmit
                : () => {
                    if (validateStep()) setStep(step + 1);
                    else Alert.alert('Validation Error', 'Please fill in all required fields');
                  }
            }
            disabled={!validateStep()}
          >
            <Text style={[styles.buttonText, styles.buttonTextPrimary]}>
              {step === 5 ? 'Submit KYC →' : 'Next →'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
