/**
 * Maps Firebase Authentication errors to clean, user-friendly messages.
 * Prevents showing raw technical messages like "Firebase: Error (auth/invalid-credential)".
 */
export function getFriendlyErrorMessage(err: any): string {
  if (!err) return 'An unknown error occurred.';
  
  const code = (err.code || '').toLowerCase();
  const message = (err.message || '').toLowerCase();
  
  // Check for credentials mismatch (invalid password, user not found, invalid credentials)
  if (
    code.includes('invalid-credential') || 
    message.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    message.includes('wrong-password') ||
    code.includes('user-not-found') ||
    message.includes('user-not-found')
  ) {
    return 'Incorrect password or email address';
  }
  
  if (code.includes('email-already-in-use') || message.includes('email-already-in-use')) {
    return 'This email address is already registered.';
  }
  
  if (code.includes('invalid-email') || message.includes('invalid-email')) {
    return 'Invalid email address format.';
  }
  
  if (code.includes('weak-password') || message.includes('weak-password')) {
    return 'Password should be at least 6 characters long.';
  }
  
  if (code.includes('user-disabled') || message.includes('user-disabled')) {
    return 'This account has been disabled. Please contact support.';
  }
  
  if (code.includes('too-many-requests') || message.includes('too-many-requests')) {
    return 'Too many failed attempts. Please try again later.';
  }
  
  if (code.includes('network-request-failed') || message.includes('network-request-failed')) {
    return 'Network error. Please check your internet connection.';
  }
  
  // Clean up any Firebase-prefixed messages that slip through
  if (err.message && err.message.startsWith('Firebase:')) {
    return err.message
      .replace(/^Firebase:\s*/i, '')
      .replace(/Error\s*\((.*?)\)\.?/i, '$1');
  }

  return err.message || 'An error occurred. Please try again.';
}
