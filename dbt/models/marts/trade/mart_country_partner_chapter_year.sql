-- One row per country x partner x HS2 chapter x year, from the country's point of view: what it
-- exports to and imports from each partner, by chapter. Powers the cross-filter between the
-- partner ranking and the product treemap on the Country page.
with pairs as (
    select * from {{ ref('int_pair_hs2_yearly') }}
),

both_directions as (
    select
        year,
        exporter_code as entity_code,
        importer_code as partner_code,
        hs2,
        value_usd as exports_usd,
        0 as imports_usd
    from pairs
    union all
    select
        year,
        importer_code as entity_code,
        exporter_code as partner_code,
        hs2,
        0 as exports_usd,
        value_usd as imports_usd
    from pairs
),

combined as (
    select
        year,
        entity_code,
        partner_code,
        hs2,
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
        hs2,
        exports_usd,
        imports_usd,
        {{ safe_divide('exports_usd', 'sum(exports_usd) over (partition by year, entity_code, partner_code)') }}
            as chapter_share_of_partner,
        {{ safe_divide('exports_usd', 'sum(exports_usd) over (partition by year, entity_code, hs2)') }}
            as partner_share_of_chapter
    from combined
)

select * from final
