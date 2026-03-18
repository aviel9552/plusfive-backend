const ALPHANUM = 'abcdefghijklmnopqrstuvwxyz0123456789';

function randomSlug(length = 7) {
  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHANUM.charAt(Math.floor(Math.random() * ALPHANUM.length));
  }
  return out;
}

async function generateUniqueBusinessPublicSlug(prisma, { length = 7, maxAttempts = 25 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const slug = randomSlug(length);
    const exists = await prisma.user.findFirst({
      where: { businessPublicSlug: slug }
    });
    if (!exists) return slug;
  }
  throw new Error('Failed to generate unique businessPublicSlug');
}

module.exports = {
  randomSlug,
  generateUniqueBusinessPublicSlug,
};

