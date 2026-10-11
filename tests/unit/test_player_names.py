from api import views as v


def test_a_short_name_is_the_family_name_with_its_particles_and_a_single_name_stays_whole():
    assert v.name_parts("Pierre-Emerick Aubameyang") == ("Pierre-Emerick", "Aubameyang")
    assert v.name_parts("Kevin De Bruyne") == ("Kevin", "De Bruyne")
    assert v.name_parts("Edwin van der Sar") == ("Edwin", "van der Sar")
    # The first word is never a particle of the family name.
    assert v.name_parts("De Lange") == ("De", "Lange")
    assert v.name_parts("Ângelo") == ("", "Ângelo")
    assert v.short_names({1: "Milan Verhoeven", 2: "Kevin De Bruyne", 3: "Ângelo"}) == {1: "Verhoeven", 2: "De Bruyne", 3: "Ângelo"}


def test_team_mates_who_share_a_family_name_are_told_apart_by_as_few_letters_of_the_given_name_as_it_takes():
    shorts = v.short_names({1: "Lucas Hernandez", 2: "Théo Hernandez", 3: "Benoit Cheyrou", 4: "Bruno Cheyrou", 5: "Kylian Mbappé"})
    assert shorts == {1: "L. Hernandez", 2: "T. Hernandez", 3: "Be. Cheyrou", 4: "Br. Cheyrou", 5: "Mbappé"}
    # Case does not tell two names apart; a single name beside a family name is told by the other's initial.
    assert v.short_names({1: "Lucas Hernandez", 2: "Théo HERNANDEZ", 3: "Hernandez"}) == {1: "L. Hernandez", 2: "T. HERNANDEZ", 3: "Hernandez"}


def test_a_given_name_is_never_cut_on_a_hyphen_and_is_written_whole_when_all_of_it_is_needed():
    shorts = v.short_names({1: "Jean Mateta", 2: "Jean-Pierre Mateta", 3: "Jean-Philippe Mateta"})
    assert shorts == {1: "Jean Mateta", 2: "Jean-Pi. Mateta", 3: "Jean-Ph. Mateta"}
    # Two players of the same name cannot be told apart: both keep the initial.
    assert v.short_names({1: "Lucas Hernandez", 2: "Lucas Hernandez"}) == {1: "L. Hernandez", 2: "L. Hernandez"}


def test_a_side_is_told_apart_within_its_whole_squad_not_only_the_players_of_the_match(config):
    from dataclasses import replace
    from test_market import mini_world
    world = mini_world(config)
    theo, lucas = world.clubs[1].player_ids[:2]
    world.players[theo] = replace(world.players[theo], name="Théo Hernandez")
    world.players[lucas] = replace(world.players[lucas], name="Lucas Hernandez")
    # Only Lucas plays, yet Théo is in the club's squad: Lucas is "L. Hernandez". Without a club, he is told by the match alone.
    assert v.squad_short_names(world, 1, {lucas: "Lucas Hernandez"})[lucas] == "L. Hernandez"
    assert v.squad_short_names(world, None, {lucas: "Lucas Hernandez"}) == {lucas: "Hernandez"}
