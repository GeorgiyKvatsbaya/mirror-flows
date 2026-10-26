-- One row per country x HS2 chapter x year: exports, imports and the country's share of world
-- exports of the chapter. Powers the chapter filter on the World page.
with products as (
    select * from {{ ref('mart_country_product_year') }}
),

chapters as (
    select
        year,
        entity_code,
        left(hs4, 2) as hs2,
        sum(exports_usd) as exports_usd,
        sum(imports_usd) as imports_usd
    from products
    group by all
)

select
    year,
    entity_code,
    hs2,
    exports_usd,
    imports_usd,
    {{ safe_divide('exports_usd', 'sum(exports_usd) over (partition by year, hs2)') }} as world_market_share
from chapters
