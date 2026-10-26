-- One row per country x HS4 heading x year: exports, imports, the country's share of world
-- exports of the product, and revealed comparative advantage (Balassa RCA).
with exports as (
    select * from {{ ref('int_exports_hs4_yearly') }}
),

imports as (
    select * from {{ ref('int_imports_hs4_yearly') }}
),

world as (
    select * from {{ ref('int_world_hs4_yearly') }}
),

country_totals as (
    select
        year,
        entity_code,
        sum(value_usd) as exports_total_usd
    from exports
    group by all
),

combined as (
    select
        coalesce(exports.year, imports.year) as year,
        coalesce(exports.entity_code, imports.entity_code) as entity_code,
        coalesce(exports.hs4, imports.hs4) as hs4,
        coalesce(exports.value_usd, 0) as exports_usd,
        coalesce(imports.value_usd, 0) as imports_usd
    from exports
    full outer join imports
        on
            exports.year = imports.year
            and exports.entity_code = imports.entity_code
            and exports.hs4 = imports.hs4
),

final as (
    select
        combined.year::smallint as year,
        combined.entity_code,
        combined.hs4,
        combined.exports_usd,
        combined.imports_usd,
        {{ safe_divide('combined.exports_usd', 'country_totals.exports_total_usd') }}
            as export_share,
        {{ safe_divide('combined.exports_usd', 'world.world_product_usd') }} as world_market_share,
        {{ rca('combined.exports_usd', 'country_totals.exports_total_usd',
               'world.world_product_usd', 'world.world_total_usd') }} as rca
    from combined
    left join country_totals
        on
            combined.year = country_totals.year
            and combined.entity_code = country_totals.entity_code
    left join world on combined.year = world.year and combined.hs4 = world.hs4
)

select * from final
