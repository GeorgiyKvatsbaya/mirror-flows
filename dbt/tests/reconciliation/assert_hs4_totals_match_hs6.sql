-- Aggregating HS6 -> HS4 must not change the yearly totals (exports and imports sides).
with hs6 as (
    select year, sum(value_usd) as value_usd from {{ ref('fct_trade_hs6') }} group by year
),

exports as (
    select year, sum(value_usd) as value_usd from {{ ref('int_exports_hs4_yearly') }} group by year
),

imports as (
    select year, sum(value_usd) as value_usd from {{ ref('int_imports_hs4_yearly') }} group by year
)

select hs6.year, hs6.value_usd, exports.value_usd as exports_usd, imports.value_usd as imports_usd
from hs6
left join exports on hs6.year = exports.year
left join imports on hs6.year = imports.year
where abs(hs6.value_usd - coalesce(exports.value_usd, 0)) > 1
   or abs(hs6.value_usd - coalesce(imports.value_usd, 0)) > 1
