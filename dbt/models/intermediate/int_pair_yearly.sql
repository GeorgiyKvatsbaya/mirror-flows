-- Total goods trade from exporter to importer per year.
select
    year,
    exporter_code,
    importer_code,
    sum(value_usd) as value_usd
from {{ ref('fct_trade_hs6') }}
group by all
