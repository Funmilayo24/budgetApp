const crypto = require("node:crypto");
const { promisify } = require("node:util");

const prisma = require("./prisma");

const scrypt = promisify(crypto.scrypt);
const SESSION_COOKIE = "budget_session";
const SESSION_DAYS = 14;

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createRandomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString("base64url");
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derivedKey = await scrypt(password, salt, 64);
  return `scrypt:${salt}:${derivedKey.toString("hex")}`;
}

async function verifyPassword(password, passwordHash) {
  const [scheme, salt, storedKey] = String(passwordHash || "").split(":");
  if (scheme !== "scrypt" || !salt || !storedKey) return false;

  const derivedKey = await scrypt(password, salt, 64);
  const storedBuffer = Buffer.from(storedKey, "hex");

  if (storedBuffer.length !== derivedKey.length) return false;
  return crypto.timingSafeEqual(storedBuffer, derivedKey);
}

function parseCookies(cookieHeader) {
  return String(cookieHeader || "")
    .split(";")
    .map((cookie) => cookie.trim())
    .filter(Boolean)
    .reduce((cookies, cookie) => {
      const separatorIndex = cookie.indexOf("=");
      if (separatorIndex === -1) return cookies;

      const key = decodeURIComponent(cookie.slice(0, separatorIndex));
      const value = decodeURIComponent(cookie.slice(separatorIndex + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function getSessionToken(req) {
  return parseCookies(req.headers.cookie)[SESSION_COOKIE];
}

function cookieOptions(expiresAt) {
  const secure = process.env.NODE_ENV === "production";
  return [
    `Path=/`,
    `HttpOnly`,
    `SameSite=Lax`,
    `Expires=${expiresAt.toUTCString()}`,
    secure ? "Secure" : ""
  ].filter(Boolean).join("; ");
}

async function createSession(res, userId) {
  const token = createRandomToken();
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.session.create({
    data: {
      tokenHash,
      userId,
      expiresAt
    }
  });

  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(expiresAt)}`);
}

async function clearSession(req, res) {
  const token = getSessionToken(req);

  if (token) {
    await prisma.session.deleteMany({
      where: { tokenHash: hashToken(token) }
    });
  }

  res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

async function getCurrentUser(req) {
  const token = getSessionToken(req);
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          createdAt: true
        }
      }
    }
  });

  if (!session || session.expiresAt <= new Date()) {
    if (session) {
      await prisma.session.delete({ where: { id: session.id } });
    }
    return null;
  }

  return session.user;
}

async function requireUser(req, res, next) {
  try {
    const user = await getCurrentUser(req);
    if (!user) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = {
  clearSession,
  createRandomToken,
  createSession,
  getCurrentUser,
  hashPassword,
  hashToken,
  isValidEmail,
  normalizeEmail,
  requireUser,
  verifyPassword
};

