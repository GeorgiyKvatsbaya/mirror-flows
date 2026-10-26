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

{#- Year filter as one expression, so the rendered SQL has the same shape in every mode. -#}
{%- set first_year = var('routes_first_year', 2015) -%}
{%- if var('baci_years', none) -%}
    {%- set year_filter = 'year in (' ~ (var('baci_years') | join(', ')) ~ ') and year >= ' ~ first_year -%}
{%- elif is_incremental() -%}
    {%- set year_filter = 'year > (select max(year) from ' ~ this ~ ')' -%}
{%- else -%}
    {%- set year_filter = 'year >= ' ~ first_year -%}
{%- endif %}

with flows as (
    select * from {{ ref('fct_trade_hs6') }}
    where {{ year_filter }}
)

select
    year,
    exporter_code,
    importer_code,
    left(hs6, 4) as hs4,
    sum(value_usd) as value_usd
from flows
group by all
