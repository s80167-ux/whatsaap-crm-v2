# Microsoft Email OAuth Environment

Add these values to the API environment before enabling Microsoft Outlook / Microsoft 365 senders:

```env
MICROSOFT_CLIENT_ID=
MICROSOFT_CLIENT_SECRET=
MICROSOFT_REDIRECT_URI=https://your-api.example.com/api/email/microsoft/callback
MICROSOFT_TENANT=common
TOKEN_ENCRYPTION_SECRET=change-this-32-plus-character-secret
```

For local development, the redirect URI can be:

```env
MICROSOFT_REDIRECT_URI=http://localhost:4000/api/email/microsoft/callback
```

The Microsoft app registration must allow the same redirect URI and request these scopes:

```text
openid profile email offline_access User.Read Mail.Send
```
