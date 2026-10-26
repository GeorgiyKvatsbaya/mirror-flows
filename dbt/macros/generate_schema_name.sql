{#- Use the configured schema name as-is (staging, intermediate, marts, reference)
    instead of dbt's default "<target>_<schema>": one warehouse file per target already. -#}
{% macro generate_schema_name(custom_schema_name, node) -%}
    {{ custom_schema_name | trim if custom_schema_name else target.schema }}
{%- endmacro %}
