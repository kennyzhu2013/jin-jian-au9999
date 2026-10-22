CREATE TABLE IF NOT EXISTS public.jinjian_user_settings (
  id text PRIMARY KEY,
  alerts_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  settings_json jsonb NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.jinjian_user_settings IS 'JinJian user price levels (我的价位) and optional settings blob';
COMMENT ON COLUMN public.jinjian_user_settings.alerts_json IS 'PriceAlert[] for 我的价位 buy/sell targets';

INSERT INTO public.jinjian_user_settings (id, alerts_json, updated_at)
VALUES (
  'default',
  '[{"id":"seed-buy","side":"buy","price":900,"note":"整数关口","createdAt":"2026-10-09T15:30:00+08:00"},{"id":"seed-sell","side":"sell","price":948,"note":"九月中段平台","createdAt":"2026-10-09T15:30:00+08:00"}]'::jsonb,
  now()
)
ON CONFLICT (id) DO NOTHING;
