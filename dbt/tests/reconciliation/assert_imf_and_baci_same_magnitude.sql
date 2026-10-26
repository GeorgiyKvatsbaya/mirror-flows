{{ config(enabled=target.name != 'ci') }}
-- Guard against unit errors between sources (thousands vs units, millions vs units): for the 50
-- largest exporters, IMF annual exports must be within a factor of 2 of BACI. Legitimate
-- methodological gaps (re-export hubs reach +60%) stay inside this band; see mart_source_comparison.
-- Structural exceptions are listed, with reasons, in seeds/source_gap_exceptions.csv.
select *
from {{ ref('mart_source_comparison') }}
where
    baci_rank <= 50
    and entity_code not in (select entity_code from {{ ref('source_gap_exceptions') }})
    and (imf_vs_baci < -0.5 or imf_vs_baci > 1.0)
