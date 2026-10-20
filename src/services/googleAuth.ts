import {
  GoogleSignin,
  isErrorWithCode,
  statusCodes,
} from '@react-native-google-signin/google-signin';

const IOS_CLIENT_ID =
  '74049305506-6t8mmu74r0v7st70sl5lrqmspgrru9ii.apps.googleusercontent.com';

const GMAIL_READONLY_SCOPE =
  'https://www.googleapis.com/auth/gmail.readonly';

GoogleSignin.configure({
  iosClientId: IOS_CLIENT_ID,
  scopes: [GMAIL_READONLY_SCOPE],
});

export type GoogleAuthState = {
  connected: boolean;
  email: string | null;
};

export async function getGoogleAuthState():
  Promise<GoogleAuthState> {
  const user = GoogleSignin.getCurrentUser();

  return {
    connected: user !== null,
    email: user?.user.email ?? null,
  };
}

export async function signInWithGoogle():
  Promise<{ email: string | null }> {
  try {
    await GoogleSignin.hasPlayServices({
      showPlayServicesUpdateDialog: true,
    });

    const response = await GoogleSignin.signIn();

    if (response.type !== 'success') {
      throw new Error('SIGN_IN_CANCELLED');
    }

    const tokens = await GoogleSignin.getTokens();

    if (!tokens.accessToken) {
      throw new Error(
        'Gmail用アクセストークンを取得できませんでした。'
      );
    }

    return {
      email: response.data.user.email ?? null,
    };
  } catch (error) {
    if (isErrorWithCode(error)) {
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        throw new Error('SIGN_IN_CANCELLED');
      }

      if (error.code === statusCodes.IN_PROGRESS) {
        throw new Error(
          'Googleログインを処理中です。'
        );
      }

      if (
        error.code ===
        statusCodes.PLAY_SERVICES_NOT_AVAILABLE
      ) {
        throw new Error(
          'Google Play Servicesを利用できません。'
        );
      }
    }

    throw error;
  }
}

export async function getGoogleAccessToken():
  Promise<string> {
  const tokens = await GoogleSignin.getTokens();

  if (!tokens.accessToken) {
    throw new Error(
      'Googleアクセストークンがありません。再度Gmail連携してください。'
    );
  }

  return tokens.accessToken;
}

export async function signOutFromGoogle():
  Promise<void> {
  await GoogleSignin.signOut();
}
