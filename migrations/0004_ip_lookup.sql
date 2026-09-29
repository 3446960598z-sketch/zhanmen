insert into allowlist (domain)
values
  ('ip.sb'),
  ('ipapi.co'),
  ('ipapi.is'),
  ('ipwho.is'),
  ('ip.api.skk.moe'),
  ('geojs.io')
on conflict (domain) do nothing;
