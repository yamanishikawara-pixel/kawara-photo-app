const JustifyText = ({ text, width = '4em', margin = '0 auto' }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', width, margin, fontSize: '0.92em' }}>
    {Array.from(text).map((c, i) => <span key={i}>{c}</span>)}
  </div>
);

export function TilePurchaseOrderSheet({
  supplierName,
  tileRows,
  materialRows,
  koujiName,
  kawaraShu,
  kawaraColor,
  deliveryAddress,
  deliveryDate,
  deliveryTime,
  note,
  companyInfo,
  orderDate: orderDateProp,
}) {
  const todayObj = new Date();
  const orderDate = orderDateProp
    ? (() => { const [y, m, d] = orderDateProp.split('-'); return `${y}年${parseInt(m, 10)}月${parseInt(d, 10)}日`; })()
    : `${todayObj.getFullYear()}年${todayObj.getMonth() + 1}月${todayObj.getDate()}日`;
  const printRows = (tileRows || []).filter(r => r.hinmei && Number(r.suryo) > 0);
  const printMatRows = (materialRows || []).filter(r => r.hinmei && Number(r.suryo) > 0);

  const base = { border: '1px solid #555', fontSize: 12, color: '#000', padding: '4px 6px', verticalAlign: 'middle' };
  const label = { ...base, background: '#f0f0f0', fontWeight: 'bold', textAlign: 'center', whiteSpace: 'nowrap' };
  const head = { ...base, background: '#e8e8e8', textAlign: 'center', fontWeight: 'bold' };
  const sec = (text) => (
    <div style={{ fontSize: 13, fontWeight: 'bold', marginTop: 12, marginBottom: 4, borderLeft: '3px solid #333', paddingLeft: 6 }}>{text}</div>
  );
  const ci = companyInfo || {};

  const fmtDeliveryDate = (d) => {
    if (!d) return '';
    const [y, m, day] = d.split('-');
    return `${y}年${parseInt(m, 10)}月${parseInt(day, 10)}日`;
  };

  return (
    <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
      <div
        id="tile-purchase-print-area"
        style={{
          fontFamily: "'BIZ UDPGothic', 'MS PGothic', sans-serif",
          width: '186mm',
          padding: '0',
          background: '#fff',
          color: '#000',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div style={{ flex: 1 }}></div>
          <div style={{ flex: 0, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 'bold', borderBottom: '2px solid #000', paddingBottom: 2, display: 'flex', justifyContent: 'space-between', minWidth: '5em', gap: '0.4em' }}>
              {Array.from('発注書').map((c, i) => <span key={i}>{c}</span>)}
            </div>
          </div>
          <div style={{ flex: 1, textAlign: 'right', fontSize: 12, color: '#444' }}>発注日: {orderDate}</div>
        </div>

        <div style={{ marginBottom: 18 }}>
          <div style={{ fontSize: 14, fontWeight: 'bold', borderBottom: '1px solid #888', paddingBottom: 3, display: 'inline-block', minWidth: '60%' }}>
            {supplierName ? `${supplierName}　御中` : '（仕入先未設定）　御中'}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
          <div style={{ fontSize: 12, lineHeight: 1.6, textAlign: 'left', border: '1px solid #888', padding: '8px 14px', minWidth: '55%' }}>
            <div style={{ fontSize: 13, fontWeight: 'bold', marginBottom: 3 }}>{ci.companyName || '有限会社 山西瓦店'}</div>
            {ci.postalCode && <div>〒{ci.postalCode}</div>}
            {ci.address && <div>{ci.address}</div>}
            {ci.tel && <div>TEL: {ci.tel}{ci.fax ? `　FAX: ${ci.fax}` : ''}</div>}
            {ci.contactPerson && <div>担当: {ci.contactPerson}</div>}
          </div>
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 12 }}>
          <tbody>
            <tr>
              <td style={{ ...label, width: '16%' }}><JustifyText text="工事件名" width="4em" /></td>
              <td style={{ ...base }} colSpan={3}>{koujiName || ''}</td>
            </tr>
            <tr>
              <td style={label}><JustifyText text="瓦種類" width="3em" /></td>
              <td style={base}>{kawaraShu || ''}</td>
              <td style={{ ...label, width: '16%' }}><JustifyText text="色" width="1em" /></td>
              <td style={{ ...base, width: '26%' }}>{kawaraColor || ''}</td>
            </tr>
            <tr>
              <td style={label}><JustifyText text="配達先" width="3em" /></td>
              <td style={base} colSpan={3}>{deliveryAddress || ''}</td>
            </tr>
            <tr>
              <td style={label}><JustifyText text="配達日" width="3em" /></td>
              <td style={base}>{fmtDeliveryDate(deliveryDate)}</td>
              <td style={{ ...label, width: '16%' }}><JustifyText text="配達時間" width="4em" /></td>
              <td style={{ ...base, width: '26%' }}>{deliveryTime || ''}</td>
            </tr>
          </tbody>
        </table>

        {sec('瓦品名')}
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 8 }}>
          <thead>
            <tr>
              <th style={{ ...head, width: '8%' }}>No.</th>
              <th style={{ ...head, width: '56%', textAlign: 'left', paddingLeft: 6 }}>品名</th>
              <th style={{ ...head, width: '14%' }}>数量</th>
              <th style={{ ...head, width: '10%' }}>単位</th>
              <th style={{ ...head, width: '12%' }}>備考</th>
            </tr>
          </thead>
          <tbody>
            {printRows.map((row, i) => (
              <tr key={row.id ?? i}>
                <td style={{ ...base, textAlign: 'center' }}>{i + 1}</td>
                <td style={base}>{row.hinmei}</td>
                <td style={{ ...base, textAlign: 'right' }}>{row.suryo}</td>
                <td style={{ ...base, textAlign: 'center' }}>{row.tani || '枚'}</td>
                <td style={base}>{row.biko || ''}</td>
              </tr>
            ))}
            <tr>
              <td colSpan={4} style={{ ...base, textAlign: 'right', fontWeight: 'bold', background: '#f5f5f5' }}>合計品目数</td>
              <td style={{ ...base, textAlign: 'center', fontWeight: 'bold', background: '#f5f5f5' }}>{printRows.length} 件</td>
            </tr>
          </tbody>
        </table>

        {printMatRows.length > 0 && (<>
          {sec('副資材')}
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 8 }}>
            <thead>
              <tr>
                <th style={{ ...head, width: '8%' }}>No.</th>
                <th style={{ ...head, width: '56%', textAlign: 'left', paddingLeft: 6 }}>品名</th>
                <th style={{ ...head, width: '14%' }}>数量</th>
                <th style={{ ...head, width: '10%' }}>単位</th>
                <th style={{ ...head, width: '12%' }}>備考</th>
              </tr>
            </thead>
            <tbody>
              {printMatRows.map((row, i) => (
                <tr key={row.id ?? i}>
                  <td style={{ ...base, textAlign: 'center' }}>{i + 1}</td>
                  <td style={base}>{row.hinmei}</td>
                  <td style={{ ...base, textAlign: 'right' }}>{row.suryo}</td>
                  <td style={{ ...base, textAlign: 'center' }}>{row.tani || ''}</td>
                  <td style={base}>{row.biko || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>)}

        {note && (
          <div style={{ marginTop: 10, border: '1px solid #ccc', padding: '6px 10px', fontSize: 12 }}>
            <div style={{ fontWeight: 'bold', marginBottom: 3 }}>備考</div>
            <div style={{ whiteSpace: 'pre-wrap' }}>{note}</div>
          </div>
        )}

        <div style={{ marginTop: 12, fontSize: 12, color: '#444' }}>
          ※上記の通り発注いたします。
        </div>
      </div>
    </div>
  );
}
