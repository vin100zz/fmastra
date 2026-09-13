"""Shared immutable containers used by the configuration schemas."""
from typing import Annotated, Any, TypeVar

from pydantic import AfterValidator, ConfigDict

T = TypeVar("T")


class FrozenDict(dict[str, T]):
    """A serializable mapping that refuses ordinary in-place mutation."""

    def _readonly(self, *args: Any, **kwargs: Any) -> None:
        raise TypeError("Configuration mappings are immutable")

    __setitem__ = __delitem__ = clear = pop = popitem = setdefault = update = _readonly
    __ior__ = _readonly


FrozenMap = Annotated[dict[str, T], AfterValidator(FrozenDict)]
MODEL_CONFIG = ConfigDict(extra="forbid", populate_by_name=True, allow_inf_nan=False)
