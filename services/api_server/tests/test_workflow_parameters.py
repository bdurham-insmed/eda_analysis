def test_select_without_options_rejected(client):
    """
    Pydantic rejects type='select' parameters that omit options.
    """
    res = client.post(
        "/workflow-parameters",
        json={"name": "x", "type": "select", "options": None, "default_value": None},
    )
    assert res.status_code == 422


def test_default_value_must_be_in_options(client):
    """
    default_value must match one of the configured options.
    """
    res = client.post(
        "/workflow-parameters",
        json={
            "name": "x",
            "type": "select",
            "options": ["a", "b"],
            "default_value": "z",
        },
    )
    assert res.status_code == 422


def test_duplicate_parameter_name_returns_409(client):
    """
    A duplicate parameter name returns a 409.
    """
    body = {"name": "dup", "type": "string", "options": None}
    res = client.post("/workflow-parameters", json=body)
    assert res.status_code == 201
    res2 = client.post("/workflow-parameters", json=body)
    assert res2.status_code == 409


def test_archive_filters_parameters(client):
    """
    Archiving a parameter hides it from the default list.
    """
    body = {"name": "to-archive", "type": "string", "options": None}
    pid = client.post("/workflow-parameters", json=body).json()["id"]
    res = client.post(f"/workflow-parameters/{pid}/archive")
    assert res.status_code == 204
    listed = client.get("/workflow-parameters").json()
    assert all(p["id"] != pid for p in listed)
    listed_all = client.get("/workflow-parameters?include_archived=true").json()
    assert any(p["id"] == pid for p in listed_all)


def test_options_disallowed_for_non_select(client):
    """
    Non-select parameters cannot carry options.
    """
    res = client.post(
        "/workflow-parameters",
        json={"name": "bad", "type": "string", "options": ["a"], "default_value": None},
    )
    assert res.status_code == 422
