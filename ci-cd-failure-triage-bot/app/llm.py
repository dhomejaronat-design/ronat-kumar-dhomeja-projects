import os


def get_llm():
    from langchain_anthropic import ChatAnthropic
    model = os.getenv("MODEL", "claude-sonnet-4-5")
    return ChatAnthropic(model=model, max_tokens=600)


def ask(prompt, llm=None):
    llm = llm or get_llm()
    return llm.invoke(prompt).content
