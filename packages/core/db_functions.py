import pprint
pp = pprint.PrettyPrinter(indent=4)
from datetime import date
import numpy as np
import pandas as pd
import io
import requests
import sys
import time
import os
import tqdm
from nsepy import get_history

# Change directory to packages/core/
path = f"./packages/core"
os.chdir(path)

# Global Variables
path_to_indices = f"./resources/indices.csv"
path_to_data = f"./resources/data/"
cols_for_db = ['Close', 'VWAP', 'Volume', 'Turnover', 'Trades', 'Deliverable Volume', '%Deliverble']

start_date = date(2018, 7, 10)
end_date = date.today()

def download_data(tickr, start_date, end_date):
    data = get_history(tickr, start_date, end_date)
    return data

def get_tickrs(path_to_indices):
    
    list_of_urls = pd.read_csv(path_to_indices).Link.to_list()
    list_of_symbols = []

    for url in list_of_urls:
        s = requests.get(url).content
        df = pd.read_csv(io.StringIO(s.decode('utf-8')))
        list_of_symbols.extend(df.Symbol.to_list())
    
    list_of_symbols = list(set(list_of_symbols))
    list_of_symbols.sort()
    return list_of_symbols

def create_base_df(start_date, end_date):
    base_df = pd.DataFrame(index = get_history("SBIN", start_date, end_date).index)
    return base_df


def create_db(path_to_indices, cols_for_db, start_date, end_date):
    
    list_of_symbols = get_tickrs(path_to_indices)

    base_df = create_base_df(start_date, end_date)
    dict_of_dbs = {col:base_df for col in cols_for_db}
    
    # pp.pprint(dict_of_dbs)

    list_of_symbols = ["SBIN", "MINDTREE"]
    

    for symbol in tqdm.tqdm(list_of_symbols):
        symbol_df = get_history(symbol, start_date, end_date)
        for col, df in dict_of_dbs.items():
            col_df = symbol_df.copy()[[col]]
            col_df.columns = [symbol]
            dict_of_dbs[col] = pd.concat([df, col_df], axis = 1)
    
    # pp.pprint(dict_of_dbs)

    for col, df in dict_of_dbs.items():
        file_name = "hist_" + col + ".pkl"
        print("Saving ", col, " data in ", path_to_data, "as: ", file_name)
        df.to_pickle(path_to_data + file_name)



    



create_db(path_to_indices, cols_for_db, start_date, end_date)



# pp.pprint(get_tickrs(path_to_indices))

# print("Hello World")
# tickr = "SBIN"
# start_date = date(2018,7,10)
# end_date = date.today()

# df = download_data(tickr, start_date, end_date)

# print(df.head())