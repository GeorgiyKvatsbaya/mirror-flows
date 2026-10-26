-- Exporter -> importer trade by HS2 chapter and year, with the chapter's share of the pair.
with pairs as (
    select * from {{ ref('int_pair_hs2_yearly') }}
)

select
    year::smallint as year,
    exporter_code,
    importer_code,
    hs2,
    value_usd,
    {{ safe_divide('value_usd', 'sum(value_usd) over (partition by year, exporter_code, importer_code)') }}
        as pair_share
from pairs
