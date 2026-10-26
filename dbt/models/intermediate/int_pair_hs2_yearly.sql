-- Exporter -> importer trade by HS2 chapter per year (for the partner-pair view).
select
    year,
    exporter_code,
    importer_code,
    left(hs6, 2) as hs2,
    sum(value_usd) as value_usd
from {{ ref('fct_trade_hs6') }}
group by all
