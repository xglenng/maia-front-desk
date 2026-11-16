// Simulate what happens when RESEND_API_KEY is missing

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY is not configured');
  }
  return { emails: { send: async () => ({}) } };
}

try {
  console.log('Attempting to get Resend client without API key...\n');
  const resend = getResend();
  console.log('✅ No error (should not reach here)');
} catch (error) {
  console.log('❌ Error caught:', error.message);
  
  // Check if this matches the email column error detection
  const isEmailColumnError = error.message.includes('email_status') ||
                              error.message.includes('column') ||
                              error.message.includes('does not exist');
  
  if (isEmailColumnError) {
    console.log('\n⚠️  This error WOULD trigger "migration pending" message');
  } else {
    console.log('\n✅ This error would NOT trigger "migration pending" message');
  }
}
