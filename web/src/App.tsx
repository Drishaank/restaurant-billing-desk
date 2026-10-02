import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const API = (import.meta as any).env.VITE_API_URL || 'http://localhost:3000';
const inr = (n: any) => '₹' + Number(n).toFixed(2);

async function api(path: string, method = 'GET', body?: any) {
  const r = await fetch(API + path, {
    method,
    headers: { 'Content-Type': 'application/json', 'x-api-key': localStorage.getItem('key') || '' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const d = await r.json();
  if (!r.ok) throw new Error(d.error || 'Request failed');
  return d;
}

function Login({ onKey }: any) {
  const [name, setName] = useState('');
  const [k, setK] = useState('');
  const [msg, setMsg] = useState('');
  const create = async () => {
    try { onKey((await api('/api/businesses', 'POST', { name })).api_key); } catch (x: any) { setMsg(x.message); }
  };
  return (
    <div className="card">
      <h2>Restaurant Billing Desk</h2>
      <input placeholder="New business name" value={name} onChange={e => setName(e.target.value)} />
      <button onClick={create}>Create business</button>
      <hr />
      <input placeholder="Or paste your access key" value={k} onChange={e => setK(e.target.value)} />
      <button onClick={() => onKey(k.trim())}>Open</button>
      <p className="err">{msg}</p>
    </div>
  );
}

function Receipt({ biz, bill, onDone }: any) {
  const upi = biz.upi_id ? `upi://pay?pa=${biz.upi_id}&pn=${encodeURIComponent(biz.name)}&am=${bill.total}&cu=INR&tn=${bill.invoice_no}` : '';
  return (
    <div>
      <div className="receipt">
        <h3>{biz.name}</h3>
        <div>{biz.address}</div>
        <div>Invoice {bill.invoice_no}</div>
        <div>{new Date(bill.created_at).toLocaleString()}</div>
        {bill.customer && <div>Customer: {bill.customer}</div>}
        <hr />
        {bill.items.map((i: any, n: number) => <div key={n} className="row"><span>{i.name} × {i.qty}</span><span>{inr(i.price * i.qty)}</span></div>)}
        <hr />
        <div className="row"><b>Total</b><b>{inr(bill.total)}</b></div>
        {upi && <div className="qr"><QRCodeSVG value={upi} size={140} /><div>Scan to pay by UPI</div></div>}
        <p>{biz.footer}</p>
      </div>
      <div style={{ textAlign: 'center' }}>
        <button onClick={() => window.print()}>Print</button> <button onClick={onDone}>Back</button>
      </div>
    </div>
  );
}

function Billing({ biz }: any) {
  const [q, setQ] = useState('');
  const [menu, setMenu] = useState<any[]>([]);
  const [cart, setCart] = useState<any[]>([]);
  const [cust, setCust] = useState('');
  const [bill, setBill] = useState<any>(null);
  const [msg, setMsg] = useState('');
  useEffect(() => { api('/api/menu?q=' + encodeURIComponent(q)).then(setMenu).catch(() => {}); }, [q]);
  const add = (m: any) => setCart(c => c.find(x => x.id === m.id) ? c.map(x => x.id === m.id ? { ...x, qty: x.qty + 1 } : x) : [...c, { ...m, qty: 1 }]);
  const total = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const save = async () => {
    try {
      setBill(await api('/api/bills', 'POST', { customer: cust, items: cart.map(i => ({ id: i.id, qty: i.qty })) }));
      setCart([]); setCust(''); setMsg('');
    } catch (x: any) { setMsg(x.message); }
  };
  if (bill) return <Receipt biz={biz} bill={bill} onDone={() => setBill(null)} />;
  return (
    <div className="grid">
      <div>
        <input style={{ width: '100%' }} placeholder="Search dishes or keywords" value={q} onChange={e => setQ(e.target.value)} />
        <div className="items">{menu.map(m => <button key={m.id} onClick={() => add(m)}>{m.name}<br />{inr(m.price)}</button>)}</div>
        {!menu.length && <p><small>No dishes found. Add some in the Menu tab.</small></p>}
      </div>
      <div>
        <h3>Current bill</h3>
        {cart.map(i => (
          <div key={i.id} className="row">
            <span>{i.name}</span>
            <input type="number" min={1} value={i.qty} onChange={e => setCart(c => c.map(x => x.id === i.id ? { ...x, qty: +e.target.value } : x))} />
            <span>{inr(i.price * i.qty)}</span>
            <button aria-label="Remove" onClick={() => setCart(c => c.filter(x => x.id !== i.id))}>×</button>
          </div>
        ))}
        <input style={{ width: '100%' }} placeholder="Customer (optional)" value={cust} onChange={e => setCust(e.target.value)} />
        <h3>Total {inr(total)}</h3>
        <button disabled={!cart.length} onClick={save}>Generate bill</button>
        <p className="err">{msg}</p>
      </div>
    </div>
  );
}

function Menu() {
  const empty = { name: '', price: '', keywords: '' };
  const [items, setItems] = useState<any[]>([]);
  const [f, setF] = useState(empty);
  const [msg, setMsg] = useState('');
  const load = () => api('/api/menu').then(setItems).catch(() => {});
  useEffect(() => { load(); }, []);
  const add = async () => {
    try { await api('/api/menu', 'POST', f); setF(empty); setMsg(''); load(); } catch (x: any) { setMsg(x.message); }
  };
  return (
    <div>
      <div className="row">
        <input placeholder="Dish name" value={f.name} onChange={e => setF({ ...f, name: e.target.value })} />
        <input placeholder="Price" type="number" value={f.price} onChange={e => setF({ ...f, price: e.target.value })} />
        <input placeholder="Keywords (paneer, spicy)" value={f.keywords} onChange={e => setF({ ...f, keywords: e.target.value })} />
        <button onClick={add}>Add dish</button>
      </div>
      <p className="err">{msg}</p>
      {items.map(i => (
        <div className="row" key={i.id}>
          <span>{i.name} <small>{i.keywords}</small></span>
          <span>{inr(i.price)}</span>
          <button onClick={async () => { await api('/api/menu/' + i.id, 'DELETE'); load(); }}>Delete</button>
        </div>
      ))}
    </div>
  );
}

function Bills({ biz }: any) {
  const [l, setL] = useState<any[]>([]);
  const [sel, setSel] = useState<any>(null);
  useEffect(() => { api('/api/bills').then(setL).catch(() => {}); }, []);
  if (sel) return <Receipt biz={biz} bill={sel} onDone={() => setSel(null)} />;
  return (
    <div>
      {!l.length && <p><small>No bills yet.</small></p>}
      {l.map(b => <div className="row link" key={b.id} onClick={() => setSel(b)}><span>{b.invoice_no}</span><span>{new Date(b.created_at).toLocaleString()}</span><span>{inr(b.total)}</span></div>)}
    </div>
  );
}

function Settings({ biz, onSave }: any) {
  const [f, setF] = useState({ upi_id: biz.upi_id, address: biz.address, footer: biz.footer });
  const [msg, setMsg] = useState('');
  const save = async () => { onSave(await api('/api/me', 'PUT', f)); setMsg('Saved'); };
  return (
    <div className="card" style={{ margin: 0 }}>
      <input placeholder="UPI ID (name@bank)" value={f.upi_id} onChange={e => setF({ ...f, upi_id: e.target.value })} />
      <input placeholder="Address" value={f.address} onChange={e => setF({ ...f, address: e.target.value })} />
      <input placeholder="Receipt footer" value={f.footer} onChange={e => setF({ ...f, footer: e.target.value })} />
      <button onClick={save}>Save settings</button>
      <small>{msg}</small>
      <small>Your access key (keep it safe): {localStorage.getItem('key')}</small>
    </div>
  );
}

export default function App() {
  const [key, setKey] = useState(localStorage.getItem('key') || '');
  const [biz, setBiz] = useState<any>(null);
  const [tab, setTab] = useState('Billing');
  const onKey = (k: string) => { localStorage.setItem('key', k); setKey(k); };
  useEffect(() => {
    if (!key) return;
    api('/api/me').then(setBiz).catch(() => { localStorage.removeItem('key'); setKey(''); setBiz(null); });
  }, [key]);
  if (!key || !biz) return <Login onKey={onKey} />;
  return (
    <>
      <header>
        <h2>{biz.name}</h2>
        {['Billing', 'Menu', 'Bills', 'Settings'].map(t => <button key={t} className={t === tab ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
        <button onClick={() => { localStorage.removeItem('key'); setKey(''); setBiz(null); }}>Log out</button>
      </header>
      <main>
        {tab === 'Billing' && <Billing biz={biz} />}
        {tab === 'Menu' && <Menu />}
        {tab === 'Bills' && <Bills biz={biz} />}
        {tab === 'Settings' && <Settings biz={biz} onSave={setBiz} />}
      </main>
    </>
  );
}
