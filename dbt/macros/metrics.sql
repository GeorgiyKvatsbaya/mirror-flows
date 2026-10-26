{#- Small, documented metric helpers shared by the marts. Unit-tested in tests/unit/. -#}

{% macro safe_divide(numerator, denominator) -%}
    ({{ numerator }}) / nullif(({{ denominator }}), 0)
{%- endmacro %}

{#- Herfindahl-Hirschman index of concentration over the rows of one group, 0..1
    (1 = everything in one partner/product). sum(share^2) = sum(v^2) / sum(v)^2, which makes it
    a plain aggregate (no window needed). -#}
{% macro hhi(value) -%}
    {{ safe_divide('sum(power(' ~ value ~ ', 2))', 'power(sum(' ~ value ~ '), 2)') }}
{%- endmacro %}

{#- Balassa revealed comparative advantage:
    (country's exports of p / country's total exports) / (world exports of p / world total).
    RCA >= 1 means the country exports relatively more of p than the world does. -#}
{% macro rca(country_product, country_total, world_product, world_total) -%}
    {{ safe_divide(
        safe_divide(country_product, country_total),
        safe_divide(world_product, world_total)
    ) }}
{%- endmacro %}

{#- Compound annual growth rate between two values `years` apart. -#}
{% macro cagr(start_value, end_value, years) -%}
    case
        when ({{ start_value }}) > 0 and ({{ end_value }}) > 0 and ({{ years }}) > 0
            then power(({{ end_value }}) / ({{ start_value }}), 1.0 / ({{ years }})) - 1
    end
{%- endmacro %}
