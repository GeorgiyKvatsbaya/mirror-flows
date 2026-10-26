-- No flows lost or duplicated by the entity mapping: fact = staging, per year (to the cent).
with staging as (
    select year, sum(value_usd) as value_usd, count(*) as row_count
    from {{ ref('stg_baci__flows') }}
    group by year
),

fact as (
    select year, sum(value_usd) as value_usd, count(*) as row_count
    from {{ ref('fct_trade_hs6') }}
    group by year
)

select staging.year, staging.value_usd, fact.value_usd as fact_value_usd,
       staging.row_count, fact.row_count as fact_row_count
from staging
full outer join fact on staging.year = fact.year
where fact.year is null
   or staging.year is null
   or staging.row_count <> fact.row_count
   or abs(staging.value_usd - fact.value_usd) > 0.01
