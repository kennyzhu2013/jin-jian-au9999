// 同源转发浙商积存金(京东)实时价。非官方公开接口，可能变更或限流；无需任何密钥。
const JD_URL = "https://api.jdjygold.com/gw2/generic/jrm/h5/m/stdLatestPrice?productSku=1961543816";

export default async function handler(req, res) {
  try {
    const upstream = await fetch(JD_URL, { headers: { Accept: "application/json" } });
    const body = await upstream.text();
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.status(upstream.ok ? 200 : 502).send(body);
  } catch (error) {
    res.status(502).json({ success: false, resultMsg: String(error) });
  }
}
