const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('./db');
const { v4: uuidv4 } = require('uuid');

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const res = await db.query('SELECT * FROM users WHERE id=$1', [id]);
    done(null, res.rows[0]);
  } catch (err) {
    done(err);
  }
});

passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: process.env.GOOGLE_CALLBACK_URL
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails && profile.emails[0] && profile.emails[0].value;
    const name = profile.displayName;
    let avatar = profile.photos && profile.photos[0] && profile.photos[0].value;
    // attempt to fetch avatar image and convert to base64 if <100kB
    try {
      if (avatar && avatar.startsWith('http')) {
        const res = await fetch(avatar);
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length < 100000) avatar = 'data:' + (res.headers.get('content-type') || 'image/jpeg') + ';base64,' + buf.toString('base64');
        else avatar = null;
      }
    } catch (e) { avatar = null }
    // find or create
    const r = await db.query('SELECT * FROM users WHERE email=$1', [email]);
    if (r.rows.length) return done(null, r.rows[0]);
    const id = uuidv4();
    await db.query('INSERT INTO users (id, email, name, avatar_base64) VALUES ($1,$2,$3,$4)', [id, email, name, avatar]);
    return done(null, { id, email, name, avatar_base64: avatar });
  } catch (err) {
    done(err);
  }
}));

module.exports = passport;
