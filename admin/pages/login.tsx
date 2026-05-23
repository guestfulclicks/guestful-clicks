import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signInAdmin } from '../lib/admin-auth';

const styles = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    backgroundColor: '#0C0904',
    fontFamily: '"DM Mono", monospace',
    padding: '16px',
  },
  card: {
    width: '100%',
    maxWidth: '420px',
    padding: '48px',
    backgroundColor: '#1A1A1A',
    border: '1px solid #D4A853',
    borderRadius: '8px',
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)',
  },
  header: {
    marginBottom: '40px',
    textAlign: 'center' as const,
  },
  logoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginBottom: '12px',
  },
  logoDot: {
    width: '8px',
    height: '8px',
    backgroundColor: '#D4A853',
    borderRadius: '50%',
  },
  logoText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#D4A853',
    letterSpacing: '2px',
    fontFamily: '"Playfair Display", serif',
  },
  subheading: {
    fontSize: '12px',
    color: '#D4A853',
    letterSpacing: '1px',
    textTransform: 'uppercase' as const,
    marginBottom: '24px',
  },
  heading: {
    fontSize: '28px',
    color: '#F0E8D5',
    fontFamily: '"Playfair Display", serif',
    marginBottom: '12px',
    fontWeight: '700',
  },
  description: {
    fontSize: '14px',
    color: '#A0A0A0',
    lineHeight: '1.6',
  },
  form: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  formGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '13px',
    color: '#D4A853',
    fontWeight: '500',
  },
  inputWrapper: {
    position: 'relative' as const,
  },
  input: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#0C0904',
    border: '1px solid rgba(255,255,255,0.15)',
    borderRadius: '4px',
    color: '#F0E8D5',
    fontSize: '14px',
    fontFamily: '"DM Mono", monospace',
    outline: 'none',
    transition: 'border-color 0.2s',
    boxSizing: 'border-box' as const,
  },
  inputFocus: {
    borderColor: '#D4A853',
  },
  toggleButton: {
    position: 'absolute' as const,
    right: '12px',
    top: '50%',
    transform: 'translateY(-50%)',
    background: 'none',
    border: 'none',
    color: '#D4A853',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '4px 8px',
  },
  button: {
    padding: '12px 24px',
    backgroundColor: '#D4A853',
    color: '#0C0904',
    border: 'none',
    borderRadius: '4px',
    fontSize: '14px',
    fontWeight: '600',
    fontFamily: '"DM Mono", monospace',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    marginTop: '8px',
  },
  buttonDisabled: {
    opacity: 0.6,
    cursor: 'not-allowed',
  },
  error: {
    fontSize: '14px',
    color: '#FF5252',
    marginTop: '4px',
    textAlign: 'center' as const,
  },
  footer: {
    marginTop: '40px',
    paddingTop: '24px',
    borderTop: '1px solid #333',
    fontSize: '12px',
    color: '#808080',
    textAlign: 'center' as const,
    lineHeight: '1.6',
  },
};

export default function AdminLogin() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailFocus, setEmailFocus] = useState(false);
  const [passwordFocus, setPasswordFocus] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const admin = await signInAdmin(email, password);
      localStorage.setItem('admin_user', JSON.stringify(admin));
      navigate('/admin/events');
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet" />
      
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <div style={styles.logoRow}>
            <div style={styles.logoDot} />
            <span style={styles.logoText}>GUESTFUL CLICKS</span>
          </div>
          <div style={styles.subheading}>Admin Panel</div>
          <h1 style={styles.heading}>Sign in to continue</h1>
          <p style={styles.description}>
            Admin access only.<br />
            Unauthorised access is logged.
          </p>
        </div>

        {/* Form */}
        <form style={styles.form} onSubmit={handleSignIn}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={() => setEmailFocus(true)}
              onBlur={() => setEmailFocus(false)}
              placeholder="admin@guestfulclicks.com"
              style={{
                ...styles.input,
                ...(emailFocus ? styles.inputFocus : {}),
              }}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <div style={styles.inputWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={() => setPasswordFocus(true)}
                onBlur={() => setPasswordFocus(false)}
                placeholder="••••••••"
                style={{
                  ...styles.input,
                  ...(passwordFocus ? styles.inputFocus : {}),
                  paddingRight: '48px',
                }}
                required
              />
              <button
                type="button"
                style={styles.toggleButton}
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          <button
            type="submit"
            style={{
              ...styles.button,
              ...(loading ? styles.buttonDisabled : {}),
            }}
            disabled={loading}
          >
            {loading ? (
              <>
                <span>●</span> Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {error && <div style={styles.error}>{error}</div>}
        </form>

        {/* Footer */}
        <div style={styles.footer}>
          Guestful Clicks Admin<br />
          All actions are logged and monitored.
        </div>
      </div>
    </div>
  );
}
