import { cny, unsignedPct } from "../lib/format.ts";
import { PARAMS } from "./params.ts";
import type { Frame } from "./frame.ts";
import type { Signal } from "./types.ts";

function signal(frame: Frame, side: Signal["side"], reason: string, riskNote: string): Signal {
  return {
    id: `range-${frame.date}-${side}`,
    date: frame.date,
    side,
    strategy: "range",
    regime: frame.regime,
    referencePrice: frame.close,
    reason,
    riskNote,
    fresh: false,
  };
}

function inBuyZone(frame: Frame): boolean {
  return frame.close <= frame.lowerBand || frame.rangePos <= PARAMS.rangeBuyPos;
}

function inSellZone(frame: Frame): boolean {
  return frame.close >= frame.upperBand || frame.rangePos >= PARAMS.rangeSellPos;
}

export function readRange(frame: Frame): Signal {
  const pos = unsignedPct(frame.rangePos);
  const band = `布林区间 ${cny(frame.lowerBand)} – ${cny(frame.upperBand)}`;
  const risk = `震荡策略最怕趋势刚启动。收盘跌破近 ${PARAMS.donchian} 日下沿 ${cny(frame.rangeLow)}，低吸失效；升破上沿 ${cny(frame.rangeHigh)}，高抛失效。`;

  if (frame.regime !== "range") {
    const edge = inBuyZone(frame) ? "价格已经贴近区间下沿" : inSellZone(frame) ? "价格已经贴近区间上沿" : "价格还在区间中部";
    return signal(
      frame,
      "watch",
      `高抛低吸待命。${band}，近 ${PARAMS.donchian} 日分位 ${pos}。${edge}，但当前按趋势处理，这一侧不执行。`,
      "状态切回震荡之前，不要用区间高低点逆势摊平。",
    );
  }

  const buy = inBuyZone(frame);
  const sell = inSellZone(frame);
  if (buy && (!sell || frame.rangePos <= 0.5)) {
    const where = frame.close <= frame.lowerBand ? `收盘触及布林下轨 ${cny(frame.lowerBand)}` : `收盘落在近 ${PARAMS.donchian} 日区间 ${pos} 分位`;
    return signal(frame, "buy", `${where}。震荡市里这是低吸参考，不是抄底保证。`, risk);
  }
  if (sell) {
    const where = frame.close >= frame.upperBand ? `收盘触及布林上轨 ${cny(frame.upperBand)}` : `收盘升到近 ${PARAMS.donchian} 日区间 ${pos} 分位`;
    return signal(frame, "sell", `${where}。震荡市里这是高抛参考。`, risk);
  }

  const towardLow = frame.rangePos < 0.5;
  return signal(
    frame,
    "watch",
    towardLow
      ? `仍是震荡。收盘在近 ${PARAMS.donchian} 日区间 ${pos} 分位，低吸区要到 ${unsignedPct(PARAMS.rangeBuyPos)} 以下，还没进去。${band}。`
      : `仍是震荡。收盘在近 ${PARAMS.donchian} 日区间 ${pos} 分位，高抛区要到 ${unsignedPct(PARAMS.rangeSellPos)} 以上，还没进去。${band}。`,
    risk,
  );
}
