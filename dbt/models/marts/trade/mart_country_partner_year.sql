-- One row per country x partner x year, from the country's point of view:
-- exports to the partner, imports from it, and the partner's rank and share.
with pairs as (
    select * from {{ ref('int_pair_yearly') }}
),

both_directions as (
    select year, exporter_code as entity_code, importer_code as partner_code,
           value_usd as exports_usd, 0 as imports_usd
    from pairs
    union all
    select year, importer_code, exporter_code, 0, value_usd
    from pairs
),

combined as (
    select
        year,
        entity_code,
        partner_code,
        sum(exports_usd) as exports_usd,
        sum(imports_usd) as imports_usd
    from both_directions
    group by all
),

final as (
    select
        year::smallint as year,
        entity_code,
        partner_code,
        exports_usd,
        imports_usd,
        exports_usd - imports_usd as balance_usd,
        {{ safe_divide('exports_usd', 'sum(exports_usd) over (partition by year, entity_code)') }}
            as export_share,
        {{ safe_divide('imports_usd', 'sum(imports_usd) over (partition by year, entity_code)') }}
            as import_share,
        rank() over (partition by year, entity_code order by exports_usd desc) as export_rank,
        rank() over (partition by year, entity_code order by imports_usd desc) as import_rank
    from combined
)

select * from final
