{{ config(contract={'enforced': true}) }}
-- One row per country x year: totals, growth, concentration and diversification.
with exports as (
    select * from {{ ref('int_exports_hs4_yearly') }}
),

world as (
    select * from {{ ref('int_world_hs4_yearly') }}
),

pairs as (
    select * from {{ ref('int_pair_yearly') }}
),

export_totals as (
    select
        year,
        exporter_code as entity_code,
        sum(value_usd) as exports_usd,
        count(*) filter (where value_usd > 0) as export_partner_count,
        {{ hhi('value_usd') }} as export_partner_hhi,
        arg_max(importer_code, value_usd) as top_export_partner
    from pairs
    group by all
),

import_totals as (
    select
        year,
        importer_code as entity_code,
        sum(value_usd) as imports_usd,
        count(*) filter (where value_usd > 0) as import_partner_count,
        arg_max(exporter_code, value_usd) as top_import_partner
    from pairs
    group by all
),

products as (
    select
        exports.year,
        exports.entity_code,
        count(*) filter (where exports.value_usd > 0) as export_product_count,
        {{ hhi('exports.value_usd') }} as export_product_hhi,
        count(*) filter (
            where {{ rca('exports.value_usd', 'country.exports_usd', 'world.world_product_usd', 'world.world_total_usd') }} >= 1
        ) as rca_product_count,
        arg_max(exports.hs4, exports.value_usd) as top_export_hs4
    from exports
    inner join export_totals as country
        on exports.year = country.year and exports.entity_code = country.entity_code
    inner join world on exports.year = world.year and exports.hs4 = world.hs4
    group by all
),

countries as (
    select entity_code from {{ ref('dim_country') }}
),

years as (
    select distinct year from world
),

combined as (
    select
        years.year,
        countries.entity_code,
        coalesce(export_totals.exports_usd, 0) as exports_usd,
        coalesce(import_totals.imports_usd, 0) as imports_usd,
        export_totals.export_partner_count,
        import_totals.import_partner_count,
        export_totals.export_partner_hhi,
        products.export_product_count,
        products.export_product_hhi,
        products.rca_product_count,
        export_totals.top_export_partner,
        import_totals.top_import_partner,
        products.top_export_hs4
    from years
    cross join countries
    left join export_totals
        on years.year = export_totals.year and countries.entity_code = export_totals.entity_code
    left join import_totals
        on years.year = import_totals.year and countries.entity_code = import_totals.entity_code
    left join products
        on years.year = products.year and countries.entity_code = products.entity_code
    where export_totals.exports_usd is not null or import_totals.imports_usd is not null
),

final as (
    select
        year::smallint as year,
        entity_code::varchar as entity_code,
        exports_usd::double as exports_usd,
        imports_usd::double as imports_usd,
        (exports_usd - imports_usd)::double as balance_usd,
        (exports_usd + imports_usd)::double as trade_usd,
        {{ safe_divide('exports_usd', 'lag(exports_usd) over (partition by entity_code order by year)') }}
        - 1 as exports_growth,
        {{ safe_divide('imports_usd', 'lag(imports_usd) over (partition by entity_code order by year)') }}
        - 1 as imports_growth,
        {{ safe_divide('exports_usd', 'sum(exports_usd) over (partition by year)') }}::double
            as world_export_share,
        export_partner_count::integer as export_partner_count,
        import_partner_count::integer as import_partner_count,
        export_partner_hhi::double as export_partner_hhi,
        export_product_count::integer as export_product_count,
        export_product_hhi::double as export_product_hhi,
        rca_product_count::integer as rca_product_count,
        top_export_partner::varchar as top_export_partner,
        top_import_partner::varchar as top_import_partner,
        top_export_hs4::varchar as top_export_hs4
    from combined
)

select * from final
