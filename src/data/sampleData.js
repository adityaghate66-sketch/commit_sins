// SAMPLE DATA ONLY - ye asli scan result nahi hai, aur koi asli secret nahi hai.
// Backend ready hone tak hum isse dashboard dikhayenge.
export const sampleScan = {
  repo: 'commit_sins/leakshield-demo (sample)',
  scannedAt: '2026-10-31T10:30:00',
  filesScanned: 128,
  findings: [
    { id: 1, provider: 'AWS', category: 'Access Key', file: 'backend/config/aws.js', line: 12, severity: 'Critical', maskedValue: 'AKIA************XYZ1', status: 'Active' },
    { id: 2, provider: 'GitHub', category: 'Personal Access Token', file: 'backend/utils/git.js', line: 8, severity: 'Critical', maskedValue: 'ghp_************a1B2', status: 'Active' },
    { id: 3, provider: 'Stripe', category: 'API Key', file: 'frontend/src/pay.js', line: 21, severity: 'High', maskedValue: 'sk_l************9xQz', status: 'Active' },
    { id: 4, provider: 'Database', category: 'Password', file: 'backend/.env.backup', line: 5, severity: 'High', maskedValue: 'mong************Xy7q', status: 'Active' },
    { id: 5, provider: 'Google', category: 'API Key', file: 'frontend/src/maps.js', line: 33, severity: 'Medium', maskedValue: 'AIza************Kd3P', status: 'Active' },
    { id: 6, provider: 'Slack', category: 'Webhook URL', file: 'scripts/notify.sh', line: 4, severity: 'Medium', maskedValue: 'http************R8Tz', status: 'Active' },
    { id: 7, provider: 'Generic', category: 'High-entropy String', file: 'docs/example.md', line: 17, severity: 'Low', maskedValue: '9fA3************b7Qe', status: 'Active' },
    { id: 8, provider: 'AWS', category: 'Secret Key', file: 'backend/seed.js', line: 40, severity: 'High', maskedValue: 'wJal************EKEY', status: 'Resolved' },
  ],
}