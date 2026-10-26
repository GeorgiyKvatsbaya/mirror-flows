-- Every dollar exported is imported by someone: world exports = world imports = world total.
with countries as (
    select year, sum(exports_usd) as exports_usd, sum(imports_usd) as imports_usd
    from {{ ref('mart_country_year') }}
    group by year
),

world as (
    select distinct year, world_total_usd from {{ ref('int_world_hs4_yearly') }}
)

select countries.*, world.world_total_usd
from countries
inner join world on countries.year = world.year
where abs(countries.exports_usd - world.world_total_usd) > 1
   or abs(countries.imports_usd - world.world_total_usd) > 1
