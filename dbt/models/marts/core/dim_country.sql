{{ config(contract={'enforced': true}) }}
-- One row per country entity. Names in Russian (and nicer English names) are produced in the
-- browser from iso2 via Intl.DisplayNames; name_ru is set only where no ISO2 code exists.
with entities as (
    select * from {{ ref('int_country_entities') }}
),

flows as (
    select
        exporter_code as entity_code,
        min(year) as first_year,
        max(year) as last_year
    from {{ ref('fct_trade_hs6') }}
    group by 1
),

final as (
    select
        entities.entity_code::varchar as entity_code,
        entities.baci_code::smallint as baci_code,
        entities.iso2::varchar as iso2,
        entities.map_iso3::varchar as map_iso3,
        entities.name_en::varchar as name_en,
        entities.name_ru::varchar as name_ru,
        coalesce(entities.region, 'Other territories')::varchar as region,
        entities.income_group::varchar as income_group,
        flows.first_year::smallint as first_year,
        flows.last_year::smallint as last_year,
        (flows.last_year is not null and flows.last_year < {{ var('last_year', 2024) }})::boolean
            as is_historical,
        entities.is_override::boolean as is_override,
        entities.note::varchar as note
    from entities
    left join flows on entities.entity_code = flows.entity_code
)

select * from final
