/**
 * Which ways in the sign-in page offers (decision 0031). Each method's module says when it is
 * available: a provider once its keys are in the environment (in demo mode always, through the demo
 * stand-in); a passkey and an emailed code always.
 */
export interface SignInMethods {
  google: boolean;
  microsoft: boolean;
  passkey: boolean;
  sso: boolean;
  emailCode: boolean;
}

export function signInMethods(): SignInMethods {
  return {
    // Set by decision 0033 (Google, Microsoft, single sign-on, emailed codes).
    google: false,
    microsoft: false,
    sso: false,
    emailCode: false,
    // Set by decision 0032 (passkeys).
    passkey: true,
  };
}
