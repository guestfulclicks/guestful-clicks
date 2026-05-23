import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { getAdminUser } from '../lib/admin-auth';
import AdminLayout from '../components/admin-layout';

const styles = {
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '32px',
  },
  heading: {
    fontSize: '28px',
    fontFamily: '"Playfair Display", serif',
    color: '#0C0904',
    fontWeight: '700',
    margin: '0 0 8px 0',
  },
  subheading: {
    fontSize: '14px',
    color: '#808080',
    margin: 0,
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse' as const,
    backgroundColor: '#FFFFFF',
    borderRadius: '4px',
    overflow: 'hidden',
    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  },
  thead: {
    backgroundColor: '#F5F5F5',
    borderBottom: '1px solid #E0E0E0',
  },
  th: {
    padding: '12px 16px',
    textAlign: 'left' as const,
    fontSize: '12px',
    fontWeight: '600',
    color: '#0C0904',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.5px',
  },
  td: {
    padding: '16px',
    borderBottom: '1px solid #E0E0E0',
    fontSize: '13px',
    color: '#333',
  },
  scorePill: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
  },
  scoreAmber: {
    backgroundColor: '#FFF3CD',
    color: '#856404',
  },
  scoreRed: {
    backgroundColor: '#F8D7DA',
    color: '#721C24',
  },
  statusPill: {
    display: 'inline-block',
    padding: '4px 8px',
    borderRadius: '4px',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'capitalize' as const,
  },
  button: {
    padding: '8px 12px',
    border: '1px solid #DDD',
    backgroundColor: '#FFFFFF',
    borderRadius: '4px',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: '"DM Mono", monospace',
  },
  buttonBlue: {
    borderColor: '#4A90E2',
    color: '#4A90E2',
  },
  emptyState: {
    textAlign: 'center' as const,
    padding: '48px 32px',
    color: '#808080',
  },
  modal: {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    zIndex: 1000,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: '1200px',
    height: '100%',
    maxHeight: '90vh',
    overflowY: 'auto' as const,
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.2)',
    display: 'flex',
    flexDirection: 'column' as const,
  },
  modalHeader: {
    padding: '24px',
    borderBottom: '1px solid #E0E0E0',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
  },
  closeButton: {
    background: 'none',
    border: 'none',
    fontSize: '24px',
    cursor: 'pointer',
    color: '#999',
  },
  comparison: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '32px',
    padding: '24px',
    flex: 1,
    overflowY: 'auto' as const,
  },
  comparisonSection: {
    marginBottom: '32px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: '#0C0904',
    marginBottom: '16px',
    paddingBottom: '8px',
    borderBottom: '2px solid #E0E0E0',
  },
  fieldRow: {
    marginBottom: '12px',
    padding: '8px',
    borderRadius: '4px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  fieldMatched: {
    backgroundColor: '#F0F9FF',
  },
  fieldMismatched: {
    backgroundColor: '#FEF2F2',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: '600',
    color: '#0C0904',
    minWidth: '120px',
  },
  fieldValue: {
    fontSize: '13px',
    color: '#333',
    flex: 1,
  },
  icon: {
    fontSize: '14px',
  },
  flagBox: {
    backgroundColor: '#FEF2F2',
    borderLeft: '4px solid #FF5252',
    padding: '12px',
    marginBottom: '12px',
    borderRadius: '4px',
  },
  flagText: {
    color: '#C62828',
    fontSize: '12px',
  },
  actionBar: {
    padding: '24px',
    borderTop: '1px solid #E0E0E0',
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
  },
  actionButton: {
    padding: '10px 16px',
    border: 'none',
    borderRadius: '4px',
    fontSize: '13px',
    fontWeight: '600',
    cursor: 'pointer',
    fontFamily: '"DM Mono", monospace',
  },
  approveButton: {
    backgroundColor: '#50C878',
    color: '#FFFFFF',
  },
  resubmitButton: {
    backgroundColor: '#FFC107',
    color: '#000',
  },
  rejectButton: {
    backgroundColor: '#FF5252',
    color: '#FFFFFF',
  },
};

interface KYCApplication {
  id: string;
  organiser_id: string;
  company_name: string;
  submission_date: string;
  ai_verification_score: number;
  ai_fraud_flags: string[];
  ai_document_results: any[];
  verification_status: string;
  organiser?: {
    name: string;
    email: string;
  };
}

export default function KYCReview() {
  const navigate = useNavigate();
  const [admin, setAdmin] = useState<any>(null);
  const [kycs, setKycs] = useState<KYCApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedKYC, setSelectedKYC] = useState<KYCApplication | null>(null);
  const [action, setAction] = useState<'approve' | 'resubmit' | 'reject' | null>(null);
  const [actionNote, setActionNote] = useState('');

  useEffect(() => {
    const checkAdmin = async () => {
      const user = await getAdminUser();
      if (!user) {
        navigate('/admin/login');
        return;
      }
      if (!user.permissions.canViewKYC) {
        navigate('/admin/kyc');
        return;
      }
      setAdmin(user);
      loadFlaggedKYCs();
    };

    checkAdmin();
  }, [navigate]);

  const loadFlaggedKYCs = async () => {
    const { data, error } = await supabase
      .from('organiser_kyc')
      .select(`
        *,
        organiser:organiser_id(name, email)
      `)
      .eq('verification_status', 'flagged')
      .order('created_at', { ascending: false });

    if (!error && data) {
      setKycs(data as any);
    }
    setLoading(false);
  };

  const handleApprove = async () => {
    if (!selectedKYC) return;

    const { error } = await supabase
      .from('organiser_kyc')
      .update({ verification_status: 'approved' })
      .eq('id', selectedKYC.id);

    if (!error) {
      // Send notification to organiser
      await supabase.from('organiser_notifications').insert({
        organiser_id: selectedKYC.organiser_id,
        type: 'kyc_approved',
        title: '✅ KYC Approved',
        message: 'Your KYC has been approved. You can now create events.',
      });

      // Mark admin notification as read
      await supabase
        .from('admin_notifications')
        .update({ is_read: true })
        .eq('organiser_id', selectedKYC.organiser_id)
        .eq('type', 'kyc_flagged');

      setSelectedKYC(null);
      await loadFlaggedKYCs();
    }
  };

  const handleResubmit = async () => {
    if (!selectedKYC) return;

    const { error } = await supabase
      .from('organiser_kyc')
      .update({ verification_status: 'pending_resubmit' })
      .eq('id', selectedKYC.id);

    if (!error) {
      await supabase.from('organiser_notifications').insert({
        organiser_id: selectedKYC.organiser_id,
        type: 'kyc_resubmit_requested',
        title: '📋 Documents Requested',
        message: actionNote || 'Please resubmit your KYC documents.',
      });

      setSelectedKYC(null);
      await loadFlaggedKYCs();
    }
  };

  const handleReject = async () => {
    if (!selectedKYC) return;

    const { error } = await supabase
      .from('organiser_kyc')
      .update({ verification_status: 'rejected' })
      .eq('id', selectedKYC.id);

    if (!error) {
      await supabase.from('organiser_notifications').insert({
        organiser_id: selectedKYC.organiser_id,
        type: 'kyc_rejected',
        title: '❌ KYC Rejected',
        message: actionNote || 'Your KYC could not be verified. Please resubmit with correct documents.',
      });

      setSelectedKYC(null);
      await loadFlaggedKYCs();
    }
  };

  const getScoreBg = (score: number) => {
    if (score >= 75) return styles.scoreAmber;
    return styles.scoreRed;
  };

  if (!admin || loading) {
    return <AdminLayout pageTitle="KYC Review">Loading...</AdminLayout>;
  }

  return (
    <AdminLayout pageTitle="KYC Review" breadcrumb="Flagged applications">
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />

      <div style={styles.header}>
        <div>
          <h1 style={styles.heading}>KYC Review</h1>
          <p style={styles.subheading}>Review flagged KYC applications that need verification</p>
        </div>
      </div>

      {kycs.length === 0 ? (
        <div style={styles.emptyState}>
          <p>No flagged KYC applications to review.</p>
        </div>
      ) : (
        <table style={styles.table}>
          <thead style={styles.thead}>
            <tr>
              <th style={styles.th}>Organiser</th>
              <th style={styles.th}>Company</th>
              <th style={styles.th}>Submitted</th>
              <th style={styles.th}>AI Score</th>
              <th style={styles.th}>Flags</th>
              <th style={styles.th}>Status</th>
              <th style={styles.th}>Action</th>
            </tr>
          </thead>
          <tbody>
            {kycs.map((kyc) => (
              <tr key={kyc.id}>
                <td style={styles.td}>{(kyc as any).organiser?.name || 'Unknown'}</td>
                <td style={styles.td}>{kyc.company_name}</td>
                <td style={styles.td}>{new Date(kyc.submission_date).toLocaleDateString()}</td>
                <td style={styles.td}>
                  <div style={{ ...styles.scorePill, ...getScoreBg(kyc.ai_verification_score) }}>
                    {kyc.ai_verification_score}%
                  </div>
                </td>
                <td style={styles.td}>{kyc.ai_fraud_flags?.length || 0}</td>
                <td style={styles.td}>
                  <div style={{ ...styles.statusPill, backgroundColor: '#FFF3CD', color: '#856404' }}>
                    Flagged
                  </div>
                </td>
                <td style={styles.td}>
                  <button
                    style={{ ...styles.button, ...styles.buttonBlue }}
                    onClick={() => setSelectedKYC(kyc)}
                  >
                    Review
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Detail Modal */}
      {selectedKYC && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <div style={styles.modalHeader}>
              <h2 style={styles.heading}>{(selectedKYC as any).organiser?.name}</h2>
              <button style={styles.closeButton} onClick={() => setSelectedKYC(null)}>×</button>
            </div>

            <div style={styles.comparison}>
              {/* Left: Organiser input */}
              <div>
                <h3 style={styles.sectionTitle}>Organiser Submitted</h3>

                <div style={styles.comparisonSection}>
                  <div style={styles.sectionTitle}>Company Details</div>
                  <div style={styles.fieldRow}>
                    <span style={styles.fieldLabel}>Company Name:</span>
                    <span style={styles.fieldValue}>{selectedKYC.company_name}</span>
                  </div>
                </div>

                {selectedKYC.ai_fraud_flags && selectedKYC.ai_fraud_flags.length > 0 && (
                  <div style={styles.comparisonSection}>
                    <div style={styles.sectionTitle}>Fraud Flags</div>
                    {selectedKYC.ai_fraud_flags.map((flag, i) => (
                      <div key={i} style={styles.flagBox}>
                        <div style={styles.flagText}>⚠️ {flag}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: AI extracted */}
              <div>
                <h3 style={styles.sectionTitle}>AI Verification Results</h3>

                <div style={styles.comparisonSection}>
                  <div style={styles.sectionTitle}>
                    Score: {selectedKYC.ai_verification_score}%
                  </div>
                  {selectedKYC.ai_document_results?.map((result: any, i: number) => (
                    <div key={i} style={styles.comparisonSection}>
                      <div style={styles.sectionTitle}>
                        {result.documentType.replace(/_/g, ' ')} - {result.confidence}% confidence
                      </div>
                      {result.crossCheckResults?.map((check: any, j: number) => (
                        <div
                          key={j}
                          style={{
                            ...styles.fieldRow,
                            ...(check.matched
                              ? styles.fieldMatched
                              : styles.fieldMismatched),
                          }}
                        >
                          <span style={styles.icon}>{check.matched ? '✅' : '❌'}</span>
                          <span style={styles.fieldLabel}>{check.field}:</span>
                          <span style={styles.fieldValue}>
                            {check.extracted} (similarity: {check.similarity}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div style={styles.actionBar}>
              {!action && (
                <>
                  <button
                    style={{ ...styles.actionButton, ...styles.approveButton }}
                    onClick={handleApprove}
                  >
                    ✅ Approve
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.resubmitButton }}
                    onClick={() => setAction('resubmit')}
                  >
                    📋 Request Resubmission
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.rejectButton }}
                    onClick={() => setAction('reject')}
                  >
                    ❌ Reject
                  </button>
                </>
              )}

              {action === 'resubmit' && (
                <>
                  <textarea
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #E0D8CC',
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '12px',
                      color: '#1A1208',
                    }}
                    placeholder="Add a note for the organiser..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                  <button
                    style={{ ...styles.actionButton, ...styles.resubmitButton }}
                    onClick={handleResubmit}
                  >
                    Confirm
                  </button>
                  <button
                    style={{ ...styles.actionButton, backgroundColor: '#999', color: '#FFF' }}
                    onClick={() => { setAction(null); setActionNote(''); }}
                  >
                    Cancel
                  </button>
                </>
              )}

              {action === 'reject' && (
                <>
                  <textarea
                    style={{
                      flex: 1,
                      padding: '8px',
                      borderRadius: '4px',
                      border: '1px solid #E0D8CC',
                      fontFamily: '"DM Mono", monospace',
                      fontSize: '12px',
                      color: '#1A1208',
                    }}
                    placeholder="Reason for rejection..."
                    value={actionNote}
                    onChange={(e) => setActionNote(e.target.value)}
                  />
                  <button
                    style={{ ...styles.actionButton, ...styles.rejectButton }}
                    onClick={handleReject}
                  >
                    Confirm
                  </button>
                  <button
                    style={{ ...styles.actionButton, backgroundColor: '#999', color: '#FFF' }}
                    onClick={() => { setAction(null); setActionNote(''); }}
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
