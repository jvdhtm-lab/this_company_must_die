from datetime import datetime
from datetime import timezone as dt_timezone
from pathlib import Path

from ariadne import (
    MutationType,
    ObjectType,
    QueryType,
    ScalarType,
    load_schema_from_path,
    make_executable_schema,
)
from graphql.language import StringValueNode

from .resolvers import (
    AuthorResolvers,
    ChoiceResolvers,
    CommentResolvers,
    PollResolvers,
)

datetime_scalar = ScalarType("DateTime")


def parse_iso_datetime(value):
    if value.endswith("Z"):
        value = value[:-1] + "+00:00"

    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=dt_timezone.utc)
    return parsed


@datetime_scalar.serializer
def serialize_datetime(value):
    return value.isoformat()


@datetime_scalar.value_parser
def parse_datetime_value(value):
    if not isinstance(value, str):
        raise ValueError("DateTime must be an ISO 8601 string")
    return parse_iso_datetime(value)


@datetime_scalar.literal_parser
def parse_datetime_literal(ast, _variables=None):
    if not isinstance(ast, StringValueNode):
        raise ValueError("DateTime must be an ISO 8601 string")
    return parse_iso_datetime(ast.value)


type_defs = load_schema_from_path(Path(__file__).parent / "schema.graphql")

query = QueryType()
mutation = MutationType()

poll_type = ObjectType("Poll")
author_type = ObjectType("Author")

PollResolvers(query, mutation)
ChoiceResolvers(query, mutation, poll_type)
CommentResolvers(query, mutation, poll_type, author_type)
AuthorResolvers(query, mutation)

resolvers = [
    query,
    mutation,
    poll_type,
    author_type,
    datetime_scalar,
]

schema = make_executable_schema(
    type_defs,
    *resolvers,
    convert_names_case=True,
)
