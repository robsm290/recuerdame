import webpush from 'web-push';
import { db, getMeta, setMeta } from './db.js';

let publicKey = getMeta('vapid_public_key');
let privateKey = getMeta('vapid_private_key');
if (!publicKey || !privateKey) {
  const keys = webpush.generateVAPIDKeys();
  publicKey = keys.publicKey;
  privateKey = keys.privateKey;
  setMeta('vapid_public_key', publicKey);
  setMeta('vapid_private_key', privateKey);
}

const contact = process.env.VAPID_CONTACT || 'mailto:admin@example.com';
webpush.setVapidDetails(contact, publicKey, privateKey);

export const vapidPublicKey = publicKey;

const deleteSub = db.prepare('DELETE FROM subscriptions WHERE endpoint = ?');

/**
 * Sends a payload to every subscription of a user.
 * Removes subscriptions the push service reports as gone (404/410).
 * Returns the number of successful deliveries.
 */
export async function sendToUser(userId, payload) {
  const subs = db.prepare('SELECT endpoint, subscription_json FROM subscriptions WHERE user_id = ?').all(userId);
  const body = JSON.stringify(payload);
  let delivered = 0;
  await Promise.all(subs.map(async (sub) => {
    try {
      await webpush.sendNotification(JSON.parse(sub.subscription_json), body, { TTL: 25 * 60 });
      delivered++;
    } catch (err) {
      if (err.statusCode === 404 || err.statusCode === 410) {
        deleteSub.run(sub.endpoint);
      } else {
        console.error(`[push] fallo al enviar a user ${userId}:`, err.statusCode || err.message);
      }
    }
  }));
  return delivered;
}
