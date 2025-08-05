// api/get-upload-url.js
import axios from 'axios';

const B2_ACCOUNT_ID = process.env.B2_ACCOUNT_ID;
const B2_APPLICATION_KEY = process.env.B2_APPLICATION_KEY;
const B2_BUCKET_NAME = process.env.B2_BUCKET_NAME;

let cachedAuth = null;

async function authorizeB2() {
  const res = await axios.get('https://api.backblazeb2.com/b2api/v2/b2_authorize_account', {
    auth: {
      username: B2_ACCOUNT_ID,
      password: B2_APPLICATION_KEY
    }
  });

  cachedAuth = {
    apiUrl: res.data.apiUrl,
    downloadUrl: res.data.downloadUrl,
    authorizationToken: res.data.authorizationToken,
    accountId: res.data.accountId
  };
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  try {
    if (!cachedAuth) await authorizeB2();

    const bucketList = await axios.post(
      `${cachedAuth.apiUrl}/b2api/v2/b2_list_buckets`,
      { accountId: cachedAuth.accountId },
      { headers: { Authorization: cachedAuth.authorizationToken } }
    );

    const bucket = bucketList.data.buckets.find(b => b.bucketName === B2_BUCKET_NAME);
    if (!bucket) return res.status(404).json({ error: 'Bucket not found' });

    const uploadUrl = await axios.post(
      `${cachedAuth.apiUrl}/b2api/v2/b2_get_upload_url`,
      { bucketId: bucket.bucketId },
      { headers: { Authorization: cachedAuth.authorizationToken } }
    );

    return res.json({
      uploadUrl: uploadUrl.data.uploadUrl,
      uploadAuthToken: uploadUrl.data.authorizationToken,
      downloadUrl: cachedAuth.downloadUrl
    });
  } catch (error) {
    console.error(error.response?.data || error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}