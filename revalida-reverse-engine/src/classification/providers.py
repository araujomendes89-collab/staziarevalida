"""Clientes de inferência local usados pelo classificador híbrido."""

import base64
import json
import re
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


@dataclass
class ParsedLocalResponse:
    output_parsed: object


def _json_from_model_text(text: str) -> str:
    cleaned = text.strip()
    fenced = re.fullmatch(
        r"```(?:json)?\s*(.*?)\s*```",
        cleaned,
        flags=re.DOTALL | re.IGNORECASE,
    )
    if fenced:
        cleaned = fenced.group(1).strip()
    return cleaned


def _decode_data_url(value: str) -> str:
    if not value.startswith("data:") or "," not in value:
        raise RuntimeError("O modelo local aceita apenas imagens embutidas em data URL.")
    _, encoded = value.split(",", 1)
    try:
        base64.b64decode(encoded, validate=True)
    except ValueError as exc:
        raise RuntimeError("Imagem embutida inválida para o modelo local.") from exc
    return encoded


class OllamaResponses:
    def __init__(
        self,
        base_url: str,
        timeout: float,
        num_ctx: int = 8192,
        num_predict: int = 1536,
        max_text_length: int = 160,
        max_list_items: int = 6,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.num_ctx = num_ctx
        self.num_predict = num_predict
        self.max_text_length = max_text_length
        self.max_list_items = max_list_items

    def parse(self, *, model, instructions, input, text_format, store=False):
        del store
        text_parts = []
        images = []
        for message in input:
            for item in message.get("content", []):
                if item.get("type") == "input_text":
                    text_parts.append(item.get("text", ""))
                elif item.get("type") == "input_image":
                    images.append(_decode_data_url(item.get("image_url", "")))

        user_message = {"role": "user", "content": "\n\n".join(text_parts)}
        if images:
            user_message["images"] = images

        local_instructions = (
            instructions
            + "\n\nREGRAS DE SAÍDA PARA EXECUÇÃO LOCAL:\n"
            + f"Seja conciso. Use no máximo {self.max_text_length} caracteres em cada "
            + f"campo textual e no máximo {self.max_list_items} elementos por lista. Use no máximo 80 "
            + "caracteres por elemento. Não repita frases, não acrescente explicações "
            + "fora do JSON e preencha somente o esquema solicitado. Todos os campos "
            + "de linguagem natural devem ser escritos em português do Brasil. Em "
            + "topic e subtopic, use expressões médicas legíveis em português; nunca "
            + "use códigos em inglês, ALL_CAPS ou palavras separadas por sublinhado."
        )
        schema = _bounded_schema(
            text_format.model_json_schema(),
            max_text_length=self.max_text_length,
            max_list_items=self.max_list_items,
        )
        payload = {
            "model": model,
            "stream": False,
            "think": False,
            "format": schema,
            "messages": [
                {"role": "system", "content": local_instructions},
                user_message,
            ],
            "options": {
                "temperature": 0,
                "num_ctx": self.num_ctx,
                "num_predict": self.num_predict,
            },
        }
        response = _request_json(
            f"{self.base_url}/api/chat",
            payload,
            timeout=self.timeout,
        )
        try:
            content = response["message"]["content"]
            parsed = text_format.model_validate_json(_json_from_model_text(content))
        except (KeyError, TypeError, ValueError) as exc:
            raise RuntimeError("O modelo local retornou JSON estruturado inválido.") from exc
        return ParsedLocalResponse(output_parsed=parsed)


def _bounded_schema(
    schema: dict,
    max_text_length: int = 160,
    max_list_items: int = 6,
) -> dict:
    """Acrescenta limites de concisão sem alterar o contrato Pydantic canônico."""
    bounded = json.loads(json.dumps(schema))
    for name, prop in bounded.get("properties", {}).items():
        if prop.get("type") == "string":
            prop.setdefault("maxLength", max_text_length)
        if prop.get("type") == "array":
            prop.setdefault("maxItems", max_list_items)
            if name == "key_concepts":
                prop.setdefault("minItems", 1)
            items = prop.get("items", {})
            if items.get("type") == "string":
                items.setdefault("maxLength", 80)
    return bounded


class OllamaClient:
    def __init__(
        self,
        base_url="http://127.0.0.1:11434",
        timeout=240.0,
        num_ctx=8192,
        num_predict=1536,
        max_text_length=160,
        max_list_items=6,
    ):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.responses = OllamaResponses(
            self.base_url,
            timeout,
            num_ctx=num_ctx,
            num_predict=num_predict,
            max_text_length=max_text_length,
            max_list_items=max_list_items,
        )

    def require_model(self, model: str) -> None:
        data = _request_json(f"{self.base_url}/api/tags", timeout=self.timeout)
        available = {
            item.get("name")
            for item in data.get("models", [])
            if isinstance(item, dict)
        }
        aliases = {model, f"{model}:latest"}
        if not available.intersection(aliases):
            names = ", ".join(sorted(name for name in available if name)) or "nenhum"
            raise RuntimeError(
                f"Modelo local {model!r} não instalado no Ollama. "
                f"Disponíveis: {names}. Execute: ollama pull {model}"
            )


def _request_json(url: str, payload=None, timeout=240.0):
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    request = Request(url, data=body, headers=headers)
    try:
        with urlopen(request, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Ollama respondeu HTTP {exc.code}: {detail}") from exc
    except URLError as exc:
        raise RuntimeError(
            "Ollama não está acessível. Inicie-o com: ollama serve"
        ) from exc
    except json.JSONDecodeError as exc:
        raise RuntimeError("Ollama retornou uma resposta que não é JSON.") from exc
