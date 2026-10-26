-- Exports by country x HS4 heading x year (all partners), the base for RCA and product views.
select
    year,
    exporter_code as entity_code,
    left(hs6, 4) as hs4,
    sum(value_usd) as value_usd
from {{ ref('fct_trade_hs6') }}
group by all
