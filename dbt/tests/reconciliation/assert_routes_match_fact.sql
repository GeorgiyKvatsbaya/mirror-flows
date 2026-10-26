-- HS4 routes must carry every dollar of the HS6 fact for the years they cover.
with routes as (
    select
        year,
        sum(value_usd) as value_usd
    from {{ ref('mart_route_product_year') }}
    group by year
),

fact as (
    select
        year,
        sum(value_usd) as value_usd
    from {{ ref('fct_trade_hs6') }}
    where year >= {{ var('routes_first_year', 2015) }}
    group by year
)

select
    fact.year,
    fact.value_usd,
    routes.value_usd as routes_usd
from fact
left join routes on fact.year = routes.year
where abs(fact.value_usd - coalesce(routes.value_usd, 0)) > 1
