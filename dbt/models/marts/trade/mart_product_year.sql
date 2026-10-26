{{ config(contract={'enforced': true}) }}
-- One row per HS4 heading x year: world trade in the product, growth, how concentrated its
-- exporters are, and the leading exporter and importer.
with exports as (
    select * from {{ ref('int_exports_hs4_yearly') }}
),

imports as (
    select * from {{ ref('int_imports_hs4_yearly') }}
),

world as (
    select * from {{ ref('int_world_hs4_yearly') }}
),

exporter_stats as (
    select
        year,
        hs4,
        {{ hhi('value_usd') }} as exporter_hhi,
        arg_max(entity_code, value_usd) as top_exporter,
        max(value_usd) as top_exporter_usd
    from exports
    group by all
),

importer_stats as (
    select
        year,
        hs4,
        arg_max(entity_code, value_usd) as top_importer,
        max(value_usd) as top_importer_usd
    from imports
    group by all
),

final as (
    select
        world.year::smallint as year,
        world.hs4::varchar as hs4,
        world.world_product_usd::double as world_usd,
        {{ safe_divide('world.world_product_usd', 'world.world_total_usd') }}::double
            as world_share,
        ({{ safe_divide('world.world_product_usd',
            'lag(world.world_product_usd) over (partition by world.hs4 order by world.year)') }}
            - 1)::double as growth,
        world.exporter_count::integer as exporter_count,
        exporter_stats.exporter_hhi::double as exporter_hhi,
        exporter_stats.top_exporter::varchar as top_exporter,
        {{ safe_divide('exporter_stats.top_exporter_usd', 'world.world_product_usd') }}::double
            as top_exporter_share,
        importer_stats.top_importer::varchar as top_importer,
        {{ safe_divide('importer_stats.top_importer_usd', 'world.world_product_usd') }}::double
            as top_importer_share
    from world
    left join exporter_stats on world.year = exporter_stats.year and world.hs4 = exporter_stats.hs4
    left join importer_stats on world.year = importer_stats.year and world.hs4 = importer_stats.hs4
)

select * from final
