{#-
  Exporter -> importer trade by HS4 heading and year, from var('routes_first_year') (2015):
  "where does a country send this product" and "which products inside a chapter flow between
  two countries". ~60M rows; built incrementally by year like fct_trade_hs6.
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
    select * from {{ ref('fct_trade_hs6') }}
    {% if var('baci_years', none) %}
    where year in ({{ var('baci_years') | join(', ') }}) and year >= {{ var('routes_first_year', 2015) }}
    {% elif is_incremental() %}
    where year > (select max(year) from {{ this }})
    {% else %}
    where year >= {{ var('routes_first_year', 2015) }}
    {% endif %}
)

select
    year,
    exporter_code,
    importer_code,
    left(hs6, 4) as hs4,
    sum(value_usd) as value_usd
from flows
group by all
