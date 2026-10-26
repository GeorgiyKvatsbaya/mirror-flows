-- Identity: for every product, the export-weighted average RCA over countries is exactly 1
-- (sum_c X_c/X_w * RCA_cp = sum_c X_cp / X_wp = 1). Catches wrong RCA denominators.
with products as (
    select * from {{ ref('mart_country_product_year') }}
    where exports_usd > 0
),

countries as (
    select year, entity_code, exports_usd from {{ ref('mart_country_year') }}
),

world as (
    select distinct year, world_total_usd from {{ ref('int_world_hs4_yearly') }}
)

select products.year, products.hs4, sum(countries.exports_usd / world.world_total_usd * products.rca) as weighted_rca
from products
inner join countries on products.year = countries.year and products.entity_code = countries.entity_code
inner join world on products.year = world.year
group by all
having abs(sum(countries.exports_usd / world.world_total_usd * products.rca) - 1) > 1e-6
