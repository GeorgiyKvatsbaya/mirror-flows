-- World exports per HS4 heading and in total, per year: the denominators for RCA and shares.
with by_product as (
    select
        year,
        hs4,
        sum(value_usd) as world_product_usd,
        count(*) filter (where value_usd > 0) as exporter_count
    from {{ ref('int_exports_hs4_yearly') }}
    group by all
)

select
    year,
    hs4,
    world_product_usd,
    exporter_count,
    sum(world_product_usd) over (partition by year) as world_total_usd
from by_product
