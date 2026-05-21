require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const { Pool } = require('pg');

const bot = new Telegraf(process.env.HR_BOT_TOKEN);
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const SUPER_ADMIN_ID = parseInt(process.env.SUPER_ADMIN_ID);
const MINI_APP_URL = process.env.MINI_APP_URL || 'https://google.com';

async function getHR(tgId) {
  if (tgId === SUPER_ADMIN_ID) return { role: 'admin' };
  const { rows } = await db.query('SELECT * FROM hr_users WHERE tg_id = $1 AND active = true', [tgId]);
  return rows[0] || null;
}

bot.start(async (ctx) => {
  const hr = await getHR(ctx.from.id);
  if (!hr) {
    return ctx.reply(
      `❌ Sizga ruxsat yo'q.\n\nSizning ID: <code>${ctx.from.id}</code>\n\nBu ID ni administratorga yuboring.`,
      { parse_mode: 'HTML' }
    );
  }
  await ctx.reply(
    `👋 Salom, ${ctx.from.first_name}!\n✅ Rol: ${hr.role}\n\nHR Panel'ni ochish uchun tugmani bosing:`,
    Markup.inlineKeyboard([[Markup.button.webApp('📊 HR Panel', MINI_APP_URL)]])
  );
});

bot.command('myid', async (ctx) => {
  await ctx.reply(`Sizning ID: <code>${ctx.from.id}</code>`, { parse_mode: 'HTML' });
});

bot.command('add_hr', async (ctx) => {
  if (ctx.from.id !== SUPER_ADMIN_ID) return ctx.reply('❌ Ruxsat yo\'q.');
  const args = ctx.message.text.split(' ').slice(1);
  if (args.length < 2) return ctx.reply('Foydalanish:\n/add_hr <tg_id> <role> [business] [branch]\n\nMisol:\n/add_hr 123456789 admin\n/add_hr 123456789 hr_manager Lublin');
  const [tgId, role, business, branch] = args;
  await db.query(`
    INSERT INTO hr_users (tg_id, role, business, branch, active, added_at)
    VALUES ($1,$2,$3,$4,true,NOW())
    ON CONFLICT (tg_id) DO UPDATE SET role=$2, business=$3, branch=$4, active=true
  `, [parseInt(tgId), role, business || null, branch || null]);
  await ctx.reply(`✅ HR qo'shildi!\nID: ${tgId}\nRol: ${role}`);
});

bot.command('list_hr', async (ctx) => {
  if (ctx.from.id !== SUPER_ADMIN_ID) return ctx.reply('❌ Ruxsat yo\'q.');
  const { rows } = await db.query('SELECT * FROM hr_users WHERE active = true');
  if (!rows.length) return ctx.reply("HR ro'yxati bo'sh.");
  const text = rows.map(r => `👤 <code>${r.tg_id}</code> — ${r.role}${r.business ? ` (${r.business})` : ''}`).join('\n');
  await ctx.reply(text, { parse_mode: 'HTML' });
});

bot.command('remove_hr', async (ctx) => {
  if (ctx.from.id !== SUPER_ADMIN_ID) return ctx.reply('❌ Ruxsat yo\'q.');
  const tgId = ctx.message.text.split(' ')[1];
  if (!tgId) return ctx.reply('Foydalanish: /remove_hr <tg_id>');
  await db.query('UPDATE hr_users SET active=false WHERE tg_id=$1', [parseInt(tgId)]);
  await ctx.reply(`✅ HR o'chirildi: ${tgId}`);
});

bot.command('stats', async (ctx) => {
  const hr = await getHR(ctx.from.id);
  if (!hr) return ctx.reply('❌ Ruxsat yo\'q.');
  const { rows } = await db.query(`
    SELECT COUNT(*) as total,
    COUNT(*) FILTER (WHERE status='new') as yangi,
    COUNT(*) FILTER (WHERE status='accepted') as qabul,
    COUNT(*) FILTER (WHERE status='rejected') as rad
    FROM candidates
  `);
  const s = rows[0];
  await ctx.reply(`📊 Statistika:\n\n📋 Jami: ${s.total}\n🆕 Yangi: ${s.yangi}\n✅ Qabul: ${s.qabul}\n❌ Rad: ${s.rad}`);
});

bot.launch({ dropPendingUpdates: true });
console.log('✅ HR bot ishga tushdi — @ScandiGrouphrbot');
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
