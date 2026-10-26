{#-
  The full-detail fact: year x exporter x importer x HS6, ~270M rows. Built incrementally by
  year with delete+insert, so adding a year (or re-running chosen years with
  --vars '{baci_years: [2024]}') only rewrites those partitions. A new BACI release revises
  every year: run with --full-refresh.
-#}
{{
  config(
    materialized='incremental',
    incremental_strategy='delete+insert',
    unique_key='year',
    on_schema_change='fail'
  )
}}

with flows as (
    select * from {{ ref('stg_baci__flows') }}
    {% if var('baci_years', none) %}
    where year in ({{ var('baci_years') | join(', ') }})
    {% elif is_incremental() %}
    where year > (select max(year) from {{ this }})
    {% endif %}
),

entities as (
    select baci_code, entity_code from {{ ref('int_country_entities') }}
),

final as (
    select
        flows.year,
        exporter.entity_code as exporter_code,
        importer.entity_code as importer_code,
        flows.hs6,
        flows.value_usd,
        flows.quantity_t
    from flows
    inner join entities as exporter on flows.exporter_code = exporter.baci_code
    inner join entities as importer on flows.importer_code = importer.baci_code
)

select * from final
