import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { randomUUID } from 'crypto';

const url = process.env.DATABASE_URL || '';
const pool = new pg.Pool({ connectionString: url, ssl: /render\.com/.test(url) ? { rejectUnauthorized: false } : false });
const q = (t, p) => pool.query(t, p);

await q(`create table if not exists businesses(id serial primary key, name text not null, upi_id text default '', address text default '', footer text default 'Thank you! Visit again.', api_key text unique not null, invoice_seq int not null default 0);
create table if not exists menu_items(id serial primary key, business_id int not null references businesses(id) on delete cascade, name text not null, price numeric(10,2) not null, keywords text default '');
create table if not exists bills(id serial primary key, business_id int not null references businesses(id) on delete cascade, invoice_no text not null, customer text default '', total numeric(10,2) not null, items jsonb not null, created_at timestamptz default now(), unique(business_id, invoice_no));`);

const app = express();
app.use(cors(), express.json());
app.get('/health', (_, r) => r.send('ok'));
const wrap = f => (req, res) => f(req, res).catch(e => { console.error(e); res.status(500).json({ error: 'Server error' }); });

app.post('/api/businesses', wrap(async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const { rows } = await q('insert into businesses(name, api_key) values($1,$2) returning *', [name, randomUUID()]);
  res.json(rows[0]);
}));

// Every route below is scoped to the business that owns the access key
app.use('/api', async (req, res, next) => {
  try {
    const { rows } = await q('select * from businesses where api_key=$1', [req.get('x-api-key') || '']);
    if (!rows[0]) return res.status(401).json({ error: 'Invalid access key' });
    req.biz = rows[0];
    next();
  } catch (e) { next(e); }
});

app.get('/api/me', (req, res) => res.json(req.biz));
app.put('/api/me', wrap(async (req, res) => {
  const { upi_id = '', address = '', footer = '' } = req.body;
  const { rows } = await q('update businesses set upi_id=$2, address=$3, footer=$4 where id=$1 returning *', [req.biz.id, upi_id, address, footer]);
  res.json(rows[0]);
}));

app.get('/api/menu', wrap(async (req, res) => {
  const s = `%${req.query.q || ''}%`;
  const { rows } = await q('select * from menu_items where business_id=$1 and (name ilike $2 or keywords ilike $2) order by name', [req.biz.id, s]);
  res.json(rows);
}));
app.post('/api/menu', wrap(async (req, res) => {
  const { name, price, keywords = '' } = req.body;
  if (!name || price === '' || !(Number(price) >= 0)) return res.status(400).json({ error: 'Name and price required' });
  const { rows } = await q('insert into menu_items(business_id,name,price,keywords) values($1,$2,$3,$4) returning *', [req.biz.id, name, price, keywords]);
  res.json(rows[0]);
}));
app.delete('/api/menu/:id', wrap(async (req, res) => {
  await q('delete from menu_items where id=$1 and business_id=$2', [req.params.id, req.biz.id]);
  res.json({ ok: true });
}));

app.get('/api/bills', wrap(async (req, res) => {
  const { rows } = await q('select * from bills where business_id=$1 order by id desc limit 100', [req.biz.id]);
  res.json(rows);
}));
app.post('/api/bills', wrap(async (req, res) => {
  const cart = Array.isArray(req.body.items) ? req.body.items : [];
  if (!cart.length) return res.status(400).json({ error: 'Cart is empty' });
  const c = await pool.connect();
  try {
    await c.query('begin');
    const { rows: menu } = await c.query('select * from menu_items where business_id=$1 and id = any($2)', [req.biz.id, cart.map(i => Number(i.id))]);
    const items = cart.flatMap(i => {
      const m = menu.find(x => x.id === Number(i.id));
      return m ? [{ name: m.name, price: Number(m.price), qty: Math.max(1, parseInt(i.qty) || 1) }] : [];
    });
    if (!items.length) throw new Error('No valid items');
    const total = Math.round(items.reduce((s, i) => s + i.price * i.qty, 0) * 100) / 100;
    const { rows: [b] } = await c.query('update businesses set invoice_seq=invoice_seq+1 where id=$1 returning invoice_seq', [req.biz.id]);
    const inv = 'INV-' + String(b.invoice_seq).padStart(5, '0');
    const { rows: [bill] } = await c.query('insert into bills(business_id,invoice_no,customer,total,items) values($1,$2,$3,$4,$5) returning *', [req.biz.id, inv, req.body.customer || '', total, JSON.stringify(items)]);
    await c.query('commit');
    res.json(bill);
  } catch (e) {
    await c.query('rollback');
    res.status(400).json({ error: e.message });
  } finally { c.release(); }
}));

app.listen(process.env.PORT || 3000, () => console.log('API up'));
