/**
 * Step-up password check against Cognito from the browser.
 *
 * Uses USER_PASSWORD_AUTH on the public app client so the password never
 * touches the Kinin API. Tokens from a successful challenge are discarded;
 * the existing Amplify session stays intact.
 */

export class InvalidCredentialsError extends Error {
  constructor() {
    super("invalid_credentials");
    this.name = "InvalidCredentialsError";
    this.code = "invalid_credentials";
  }
}

/**
 * @param {{ username: string, password: string }} args
 * @returns {Promise<void>}
 */
export async function verifyCognitoPassword({ username, password }) {
  const clientId = String(import.meta.env.VITE_COGNITO_USER_POOL_CLIENT_ID || "").trim();
  const region = String(import.meta.env.VITE_AWS_REGION || "us-east-1").trim();
  const user = String(username || "").trim();
  const pass = String(password || "");
  if (!clientId) throw new Error("Cognito is not configured in this build.");
  if (!user || !pass) throw new InvalidCredentialsError();

  const res = await fetch(`https://cognito-idp.${region}.amazonaws.com/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.1",
      "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
    },
    body: JSON.stringify({
      AuthFlow: "USER_PASSWORD_AUTH",
      ClientId: clientId,
      AuthParameters: {
        USERNAME: user,
        PASSWORD: pass,
      },
    }),
  });

  let data = {};
  try {
    data = await res.json();
  } catch {
    data = {};
  }

  const type = String(data.__type || data.code || "");
  const message = String(data.message || data.Message || "");
  if (
    !res.ok ||
    /NotAuthorizedException|UserNotFoundException/i.test(type) ||
    /incorrect username or password/i.test(message)
  ) {
    throw new InvalidCredentialsError();
  }
  // Only a completed auth (tokens) counts as step-up success. Challenges like
  // NEW_PASSWORD_REQUIRED must not unlock account deletion.
  if (!data.AuthenticationResult?.AccessToken) {
    throw new InvalidCredentialsError();
  }
}
